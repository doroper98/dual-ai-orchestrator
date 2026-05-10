import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runAgentPrompt } from './verify.js';

const VALID_AGENTS = new Set(['claude', 'codex']);
const MAX_CAPTURE_CHARS = 4_000;

export async function runTask(taskPath, {
  cwd = process.cwd(),
  runner,
  commandResolver,
} = {}) {
  const absoluteTaskPath = path.resolve(cwd, taskPath);
  const taskMarkdown = await readFile(absoluteTaskPath, 'utf8');
  const task = parseTaskMarkdown(taskMarkdown, absoluteTaskPath, cwd);

  const startedAt = new Date().toISOString();
  await appendEvent(cwd, {
    type: 'agent_started',
    task_id: task.taskId,
    agent: task.agent,
    path: path.relative(cwd, absoluteTaskPath),
  });

  const result = await runAgentPrompt(task.agent, taskMarkdown, { cwd, runner, commandResolver });
  const finishedAt = new Date().toISOString();
  const ok = result.exitCode === 0 && !result.timedOut;
  const failureReason = ok ? 'none' : classifyFailure(result);

  await mkdir(path.dirname(task.outputPath), { recursive: true });
  await writeFile(task.outputPath, formatTaskResult({
    task,
    command: result.command,
    args: result.args,
    startedAt,
    finishedAt,
    ok,
    failureReason,
    ...result,
  }));

  await appendEvent(cwd, {
    type: ok ? 'agent_completed' : 'agent_failed',
    task_id: task.taskId,
    agent: task.agent,
    exit_code: result.exitCode,
    failure_reason: failureReason,
    output_path: path.relative(cwd, task.outputPath),
  });
  await updateSharedState(cwd, {
    task,
    ok,
    failureReason,
    outputPath: task.outputPath,
    finishedAt,
  });

  return {
    ok,
    agent: task.agent,
    taskId: task.taskId,
    outputPath: task.outputPath,
    ...result,
  };
}

export async function processInboxTask(taskPath, {
  cwd = process.cwd(),
  runner,
  commandResolver,
} = {}) {
  const absoluteTaskPath = path.resolve(cwd, taskPath);
  const agent = inferAgentFromPath(absoluteTaskPath);
  if (!VALID_AGENTS.has(agent)) {
    throw new Error('Inbox task path must be under .ai-workflow/inbox/<claude|codex>.');
  }

  const fileName = path.basename(absoluteTaskPath);
  const processingPath = path.join(cwd, '.ai-workflow', 'processing', agent, fileName);
  const archivePath = path.join(cwd, '.ai-workflow', 'archive', agent, fileName);
  const failedPath = path.join(cwd, '.ai-workflow', 'failed', agent, fileName);

  await mkdir(path.dirname(processingPath), { recursive: true });
  await rename(absoluteTaskPath, processingPath);

  const result = await runTask(processingPath, { cwd, runner, commandResolver });
  const finalPath = result.ok ? archivePath : failedPath;
  await mkdir(path.dirname(finalPath), { recursive: true });
  await rename(processingPath, finalPath);

  await appendEvent(cwd, {
    type: result.ok ? 'task_archived' : 'task_failed',
    task_id: result.taskId,
    agent,
    path: path.relative(cwd, finalPath),
  });

  return {
    ...result,
    taskPath: finalPath,
  };
}

export function parseTaskMarkdown(markdown, taskPath, cwd = process.cwd()) {
  const sections = parseSections(markdown);
  const agent = normalizeSectionValue(sections.get('target agent')) || inferAgentFromPath(taskPath);
  if (!VALID_AGENTS.has(agent)) {
    throw new Error('Task must include ## Target Agent with claude or codex, or be placed under .ai-workflow/inbox/<agent>.');
  }

  const taskId = normalizeSectionValue(sections.get('task id')) || path.basename(taskPath, path.extname(taskPath));
  const completionFile = normalizeSectionValue(sections.get('completion file'));
  const outputPath = completionFile
    ? path.resolve(cwd, completionFile)
    : path.join(cwd, '.ai-workflow', 'outbox', agent, `${taskId}-result.md`);

  return {
    agent,
    taskId,
    taskPath,
    outputPath,
    manualHandoff: sections.get('manual handoff')?.trim() || '',
  };
}

function parseSections(markdown) {
  const sections = new Map();
  const lines = markdown.split(/\r?\n/u);
  let currentHeading = null;
  let currentBody = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/u);
    if (heading) {
      if (currentHeading) {
        sections.set(currentHeading, currentBody.join('\n').trim());
      }
      currentHeading = heading[1].trim().toLowerCase();
      currentBody = [];
    } else if (currentHeading) {
      currentBody.push(line);
    }
  }

  if (currentHeading) {
    sections.set(currentHeading, currentBody.join('\n').trim());
  }

  return sections;
}

function normalizeSectionValue(value) {
  return value?.split(/\r?\n/u).find((line) => line.trim())?.trim().toLowerCase() || '';
}

function inferAgentFromPath(taskPath) {
  const parts = taskPath.split(/[\\/]+/u).map((part) => part.toLowerCase());
  const inboxIndex = parts.lastIndexOf('inbox');
  if (inboxIndex >= 0) {
    return parts[inboxIndex + 1] || '';
  }
  return '';
}

function formatTaskResult({
  task,
  command,
  args,
  startedAt,
  finishedAt,
  ok,
  failureReason,
  exitCode,
  timedOut,
  stdout,
  stderr,
}) {
  return `# Task Result: ${task.taskId}

- Task ID: ${task.taskId}
- Target Agent: ${task.agent}
- Source Task: ${task.taskPath}
- Command: ${command ? [command, ...args].join(' ') : 'not found'}
- Started At: ${startedAt}
- Finished At: ${finishedAt}
- Exit Code: ${exitCode ?? 'none'}
- Timed Out: ${timedOut ? 'yes' : 'no'}
- Status: ${ok ? 'pass' : 'fail'}
- Failure Reason: ${failureReason}

## Stdout

\`\`\`text
${formatCapturedText(stdout)}
\`\`\`

## Stderr

\`\`\`text
${formatCapturedText(stderr)}
\`\`\`

## Manual Handoff

${task.manualHandoff || 'none'}
`;
}

function formatCapturedText(value) {
  const text = value.trim();
  if (text.length <= MAX_CAPTURE_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_CAPTURE_CHARS)}

[truncated ${text.length - MAX_CAPTURE_CHARS} characters]`;
}

async function appendEvent(cwd, event) {
  const eventsPath = path.join(cwd, '.ai-workflow', 'events.jsonl');
  await mkdir(path.dirname(eventsPath), { recursive: true });
  await appendFile(eventsPath, `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
}

async function updateSharedState(cwd, { task, ok, failureReason, outputPath, finishedAt }) {
  const sharedRoot = path.join(cwd, '.ai-workflow', 'shared');
  await mkdir(sharedRoot, { recursive: true });

  const relativeOutputPath = path.relative(cwd, outputPath);
  const status = `# PoC Status

- Phase: task-${ok ? 'completed' : 'failed'}
- Mode: semi_auto
- Last Actor: ${task.agent}
- Last Task: ${task.taskId}
- Last Result: ${relativeOutputPath}
- Failure Reason: ${failureReason}
- Next action: ${nextActionForTaskResult(ok, failureReason)}
`;

  await writeFile(path.join(sharedRoot, 'status.md'), status);
  await appendFile(path.join(sharedRoot, 'context-ledger.md'), `

## Task ${ok ? 'Completed' : 'Failed'}: ${task.taskId}

- Time: ${finishedAt}
- Agent: ${task.agent}
- Result: ${relativeOutputPath}
- Status: ${ok ? 'pass' : 'fail'}
- Failure Reason: ${failureReason}

## Manual Handoff

${task.manualHandoff || 'none'}
`);
}

function classifyFailure({ stdout = '', stderr = '', timedOut }) {
  const output = `${stdout}\n${stderr}`;
  if (timedOut) {
    return 'timeout';
  }
  if (/usage limit|try again at|purchase more credits/iu.test(output)) {
    return 'usage_limit';
  }
  if (/not found|ENOENT/iu.test(output)) {
    return 'cli_not_found';
  }
  return 'agent_error';
}

function nextActionForTaskResult(ok, failureReason) {
  if (ok) {
    return 'review the latest outbox result or create the next inbox task';
  }
  if (failureReason === 'usage_limit') {
    return 'wait for the CLI usage limit reset, then retry the task';
  }
  if (failureReason === 'timeout') {
    return 'inspect the timed out task and retry manually if appropriate';
  }
  return 'inspect failed task output and decide whether to retry';
}
