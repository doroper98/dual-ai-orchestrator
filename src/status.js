import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const AGENTS = ['claude', 'codex'];
const QUEUES = ['inbox', 'processing', 'outbox', 'archive', 'failed'];

export async function getStatus({ cwd = process.cwd(), recentLimit = 5 } = {}) {
  const workflowRoot = path.join(cwd, '.ai-workflow');
  const events = await readEvents(path.join(workflowRoot, 'events.jsonl'));
  const queues = await readQueueCounts(workflowRoot);
  const verification = await readVerificationSummary(path.join(workflowRoot, 'verification.md'));
  const recentEvents = events.slice(-recentLimit);
  const lastEvent = events.at(-1) || null;

  return {
    workflowRoot,
    verification,
    queues,
    recentEvents,
    totals: {
      events: events.length,
      completed: events.filter((event) => event.type === 'agent_completed').length,
      failed: events.filter((event) => event.type === 'agent_failed').length,
      archived: events.filter((event) => event.type === 'task_archived').length,
    },
    nextAction: inferNextAction({ queues, verification, lastEvent }),
  };
}

export function formatStatus(status) {
  const lines = [
    'Dual AI Orchestrator Status',
    '',
    `Workflow Root: ${status.workflowRoot}`,
    `Prerequisites: ${status.verification.prerequisites}`,
    `Claude Invocation: ${status.verification.claudeInvocation}`,
    `Codex Invocation: ${status.verification.codexInvocation}`,
    '',
    'Queues:',
  ];

  for (const queue of QUEUES) {
    const counts = status.queues[queue];
    lines.push(`  ${queue}: claude=${counts.claude} codex=${counts.codex}`);
  }

  lines.push(
    '',
    `Events: total=${status.totals.events} completed=${status.totals.completed} failed=${status.totals.failed} archived=${status.totals.archived}`,
    '',
    'Recent Events:',
  );

  if (status.recentEvents.length === 0) {
    lines.push('  none');
  } else {
    for (const event of status.recentEvents) {
      const task = event.task_id ? ` task=${event.task_id}` : '';
      const agent = event.agent ? ` agent=${event.agent}` : '';
      lines.push(`  ${event.time || 'unknown'} ${event.type || 'unknown'}${agent}${task}`);
    }
  }

  lines.push('', `Next Action: ${status.nextAction}`);
  return `${lines.join('\n')}\n`;
}

async function readEvents(eventsPath) {
  let content = '';
  try {
    content = await readFile(eventsPath, 'utf8');
  } catch {
    return [];
  }

  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'invalid_event', raw: line };
      }
    });
}

async function readQueueCounts(workflowRoot) {
  const result = {};

  for (const queue of QUEUES) {
    result[queue] = {};
    for (const agent of AGENTS) {
      result[queue][agent] = await countMarkdownFiles(path.join(workflowRoot, queue, agent));
    }
  }

  return result;
}

async function countMarkdownFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

async function readVerificationSummary(verificationPath) {
  let content = '';
  try {
    content = await readFile(verificationPath, 'utf8');
  } catch {
    return {
      prerequisites: 'missing',
      claudeInvocation: 'missing',
      codexInvocation: 'missing',
    };
  }

  return {
    prerequisites: content.includes('| Claude CLI | yes | pass |') && content.includes('| Codex CLI | yes | pass |') ? 'pass' : 'unknown',
    claudeInvocation: readSectionStatus(content, 'Claude CLI Invocation'),
    codexInvocation: readSectionStatus(content, 'Codex CLI Invocation'),
    claudeFailureReason: readSectionValue(content, 'Claude CLI Invocation', 'Failure Reason'),
    codexFailureReason: readSectionValue(content, 'Codex CLI Invocation', 'Failure Reason'),
  };
}

function readSectionStatus(content, title) {
  return readSectionValue(content, title, 'Status') || 'missing';
}

function readSectionValue(content, title, field) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = content.match(new RegExp(`## ${escapedTitle}\\n[\\s\\S]*?- ${escapedField}: (\\w+)`, 'u'));
  return match?.[1] || '';
}

function inferNextAction({ queues, verification, lastEvent }) {
  if (verification.prerequisites !== 'pass') {
    return 'run dual-ai-poc prerequisites';
  }
  if (verification.claudeInvocation !== 'pass') {
    if (verification.claudeFailureReason === 'usage_limit') {
      return 'wait for the Claude CLI usage limit reset, then run dual-ai-poc verify claude';
    }
    return 'run dual-ai-poc verify claude';
  }
  if (verification.codexInvocation !== 'pass') {
    if (verification.codexFailureReason === 'usage_limit') {
      return 'wait for the Codex CLI usage limit reset, then run dual-ai-poc verify codex';
    }
    return 'run dual-ai-poc verify codex';
  }
  if (queues.processing.claude > 0 || queues.processing.codex > 0) {
    return 'check processing tasks or wait for the active run to finish';
  }
  if (queues.failed.claude > 0 || queues.failed.codex > 0) {
    return 'inspect failed tasks under .ai-workflow/failed';
  }
  if (lastEvent?.failure_reason === 'usage_limit') {
    return 'wait for the CLI usage limit reset, then retry the last task';
  }
  if (lastEvent?.failure_reason === 'call_limit') {
    return 'increase call limits in .ai-workflow/config.yml or pause before running more tasks';
  }
  if (queues.inbox.claude > 0 || queues.inbox.codex > 0) {
    return 'run dual-ai-poc watch or run-task for pending inbox files';
  }
  if (lastEvent?.type === 'task_archived') {
    return 'review the latest outbox result or create the next inbox task';
  }
  return 'create a Markdown task in .ai-workflow/inbox/<agent> or run dual-ai-poc watch';
}
