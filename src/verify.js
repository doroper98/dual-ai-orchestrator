import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURE_CHARS = 4_000;

const AGENTS = {
  claude: {
    displayName: 'Claude',
    marker: 'Claude PoC OK',
    commands: ['claude'],
    args: ['-p'],
  },
  codex: {
    displayName: 'Codex',
    marker: 'Codex PoC OK',
    commands: getCodexCommandCandidates(),
    args: ['exec', '--ephemeral', '--ignore-rules', '--color', 'never', '-'],
  },
};

export async function runAgentPrompt(agentName, input, {
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  runner = runProcess,
  commandResolver = resolveFirstCommand,
} = {}) {
  const agent = AGENTS[agentName];
  if (!agent) {
    throw new Error(`Unsupported agent: ${agentName}`);
  }

  const command = await commandResolver(agent.commands);
  if (!command) {
    return {
      agent: agentName,
      displayName: agent.displayName,
      command: null,
      args: agent.args,
      exitCode: null,
      timedOut: false,
      stdout: '',
      stderr: `${agent.displayName} CLI not found`,
    };
  }

  const result = await runner(command, agent.args, { cwd, input, timeoutMs });
  return {
    agent: agentName,
    displayName: agent.displayName,
    command,
    args: agent.args,
    ...result,
  };
}

export async function runAgentVerification(agentName, {
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  runner = runProcess,
  commandResolver = resolveFirstCommand,
} = {}) {
  const agent = AGENTS[agentName];
  if (!agent) {
    throw new Error(`Unsupported agent: ${agentName}`);
  }

  const prompt = buildVerificationPrompt(agent.displayName, agent.marker);
  const startedAt = new Date().toISOString();
  const result = await runAgentPrompt(agentName, prompt, { cwd, timeoutMs, runner, commandResolver });
  const finishedAt = new Date().toISOString();
  const ok = result.exitCode === 0 && result.stdout.includes(agent.marker);
  const failureReason = ok ? 'none' : classifyFailure(result);
  const workflowRoot = path.join(cwd, '.ai-workflow');
  const outputPath = path.join(workflowRoot, 'outbox', agentName, `verify-${agentName}-result.md`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formatVerificationResult({
    agentName,
    displayName: agent.displayName,
    command: result.command,
    args: result.args,
    marker: agent.marker,
    startedAt,
    finishedAt,
    ok,
    failureReason,
    ...result,
  }));
  await updateVerificationSummary(workflowRoot, {
    displayName: agent.displayName,
    outputPath,
    marker: agent.marker,
    ok,
    failureReason,
    ...result,
  });

  return {
    agent: agentName,
    ok,
    outputPath,
    marker: agent.marker,
    failureReason,
    ...result,
  };
}

async function updateVerificationSummary(workflowRoot, result) {
  const verificationPath = path.join(workflowRoot, 'verification.md');
  let content = '';

  try {
    content = await readFile(verificationPath, 'utf8');
  } catch {
    content = '# PoC Verification Result\n';
  }

  const sectionTitle = `## ${result.displayName} CLI Invocation`;
  const section = `${sectionTitle}

- Status: ${result.ok ? 'pass' : 'fail'}
- Exit Code: ${result.exitCode ?? 'none'}
- Timed Out: ${result.timedOut ? 'yes' : 'no'}
- Expected Marker: ${result.marker}
- Failure Reason: ${result.failureReason}
- Result File: ${result.outputPath}
- Updated At: ${new Date().toISOString()}
`;

  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const sectionPattern = new RegExp(`\\n${escapedTitle}\\n[\\s\\S]*?(?=\\n## |$)`, 'u');
  const nextContent = sectionPattern.test(content)
    ? content.replace(sectionPattern, `\n${section}`)
    : `${content.trimEnd()}\n\n${section}`;

  await writeFile(verificationPath, `${nextContent.trimEnd()}\n`);
}

function buildVerificationPrompt(displayName, marker) {
  return [
    `You are being called by a local CLI proof-of-concept verification step for ${displayName}.`,
    'Do not modify files. Do not run tools. Reply with exactly this text and nothing else:',
    marker,
  ].join('\n');
}

function formatVerificationResult({
  agentName,
  displayName,
  command,
  args,
  marker,
  startedAt,
  finishedAt,
  ok,
  failureReason,
  exitCode,
  timedOut,
  stdout,
  stderr,
}) {
  return `# ${displayName} CLI Verification

- Agent: ${agentName}
- Command: ${[command, ...args].join(' ')}
- Started At: ${startedAt}
- Finished At: ${finishedAt}
- Exit Code: ${exitCode ?? 'none'}
- Timed Out: ${timedOut ? 'yes' : 'no'}
- Expected Marker: ${marker}
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
`;
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

function formatCapturedText(value) {
  const text = value.trim();
  if (text.length <= MAX_CAPTURE_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_CAPTURE_CHARS)}

[truncated ${text.length - MAX_CAPTURE_CHARS} characters]`;
}

async function resolveFirstCommand(commands) {
  for (const command of commands) {
    const resolved = await resolveCommand(command);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function resolveCommand(command) {
  if (path.isAbsolute(command)) {
    try {
      await access(command);
      return command;
    } catch {
      return null;
    }
  }

  const lookupCommand = process.platform === 'win32' ? 'where' : 'sh';
  const lookupArgs = process.platform === 'win32' ? [command] : ['-c', `command -v ${command}`];

  try {
    const { stdout } = await execFileAsync(lookupCommand, lookupArgs, { timeout: 5_000 });
    const matches = stdout.trim().split(/\r?\n/u).filter(Boolean);
    if (process.platform === 'win32') {
      return matches.find((match) => /\.(cmd|exe|bat)$/iu.test(match)) || matches[0] || command;
    }
    return matches[0] || command;
  } catch {
    return null;
  }
}

function getCodexCommandCandidates() {
  const commands = ['codex'];

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    commands.push(path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin', 'codex.exe'));
  }

  return commands;
}

function runProcess(command, args, { cwd, input, timeoutMs }) {
  return new Promise((resolve) => {
    const spawnCommand = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(command) ? 'cmd.exe' : command;
    const spawnArgs = spawnCommand === 'cmd.exe'
      ? ['/d', '/s', '/c', ['call', command, ...args].map(quoteWindowsArg).join(' ')]
      : args;
    const child = spawn(spawnCommand, spawnArgs, {
      cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        timedOut,
        stdout,
        stderr: `${stderr}${error.message}`,
      });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        timedOut,
        stdout,
        stderr,
      });
    });

    child.stdin.end(input);
  });
}

function quoteWindowsArg(value) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}
