import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 5_000;

async function commandExists(command) {
  if (path.isAbsolute(command)) {
    try {
      await access(command);
      return true;
    } catch {
      return false;
    }
  }

  const lookupCommand = process.platform === 'win32' ? 'where' : 'sh';
  const lookupArgs = process.platform === 'win32' ? [command] : ['-c', `command -v ${command}`];

  try {
    await execFileAsync(lookupCommand, lookupArgs, { timeout: DEFAULT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function captureVersion(command, args) {
  try {
    const { stdout, stderr } = await execCommand(command, args);
    return (stdout || stderr).trim().split('\n')[0] || 'available';
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 'not found';
    }
    const output = `${error?.stdout || ''}${error?.stderr || ''}`.trim().split('\n')[0];
    return output || `available, version check failed: ${error?.message || 'unknown error'}`;
  }
}

async function execCommand(command, args) {
  if (process.platform !== 'win32') {
    return execFileAsync(command, args, { timeout: DEFAULT_TIMEOUT_MS });
  }

  const commandLine = [command, ...args].map(quoteWindowsArg).join(' ');
  return execFileAsync('cmd.exe', ['/d', '/s', '/c', commandLine], { timeout: DEFAULT_TIMEOUT_MS });
}

function quoteWindowsArg(value) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}

async function detectPowerShell() {
  for (const command of ['pwsh', 'powershell']) {
    if (await commandExists(command)) {
      return {
        name: 'PowerShell',
        command,
        required: true,
        ok: true,
        version: await captureVersion(command, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']),
        notes: command === 'pwsh' ? 'PowerShell 7+ executable detected.' : 'Windows PowerShell detected; PowerShell 7 is recommended for the PoC.',
      };
    }
  }

  return {
    name: 'PowerShell',
    command: 'pwsh',
    required: true,
    ok: false,
    version: 'not found',
    notes: 'Install PowerShell 7+ and ensure pwsh is on PATH.',
  };
}

async function detectCommand({ name, command, args = ['--version'], required = true, notes }) {
  const exists = await commandExists(command);

  return {
    name,
    command,
    required,
    ok: required ? exists : true,
    version: exists ? await captureVersion(command, args) : 'not found',
    notes: exists ? notes.available : notes.missing,
  };
}

async function detectFirstCommand({ name, commands, args = ['--version'], required = true, notes }) {
  for (const command of commands) {
    if (await commandExists(command)) {
      return {
        name,
        command,
        required,
        ok: true,
        version: await captureVersion(command, args),
        notes: notes.available,
      };
    }
  }

  return {
    name,
    command: commands[0],
    required,
    ok: !required,
    version: 'not found',
    notes: notes.missing,
  };
}

function getCodexCommandCandidates() {
  const commands = ['codex'];

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    commands.push(path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin', 'codex.exe'));
  }

  return commands;
}

export async function checkPrerequisites({ cwd = process.cwd(), writeVerification = true } = {}) {
  const workflowRoot = path.join(cwd, '.ai-workflow');
  const checks = [
    await detectPowerShell(),
    {
      name: 'Node.js',
      command: 'node',
      required: true,
      ok: true,
      version: process.version,
      notes: 'Current process is running under Node.js.',
    },
    await detectCommand({
      name: 'Git',
      command: 'git',
      notes: {
        available: 'Git CLI detected.',
        missing: 'Install Git CLI and ensure git is on PATH.',
      },
    }),
    await detectCommand({
      name: 'Claude CLI',
      command: 'claude',
      required: true,
      notes: {
        available: 'Claude CLI detected. Run dual-ai-poc verify claude to verify non-interactive execution.',
        missing: 'Install Claude CLI and log in before running future verify commands.',
      },
    }),
    await detectFirstCommand({
      name: 'Codex CLI',
      commands: getCodexCommandCandidates(),
      required: true,
      notes: {
        available: 'Codex CLI detected. Run dual-ai-poc verify codex to verify non-interactive execution.',
        missing: 'Install Codex CLI and log in before running future verify commands.',
      },
    }),
  ];

  let workflowInitialized = true;
  try {
    await access(workflowRoot);
  } catch {
    workflowInitialized = false;
  }

  const result = {
    ok: workflowInitialized && checks.every((check) => check.ok),
    generatedAt: new Date().toISOString(),
    platform: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    workflowRoot,
    workflowInitialized,
    checks,
  };

  if (writeVerification) {
    await writePrerequisitesVerification(workflowRoot, result);
  }

  return result;
}

async function writePrerequisitesVerification(workflowRoot, result) {
  await mkdir(workflowRoot, { recursive: true });
  const verificationPath = path.join(workflowRoot, 'verification.md');
  let existingContent = '';
  try {
    existingContent = await readFile(verificationPath, 'utf8');
  } catch {
    existingContent = '';
  }

  const content = preserveInvocationSections(formatPrerequisitesMarkdown(result), existingContent);
  await writeFile(verificationPath, content);
}

function preserveInvocationSections(nextContent, existingContent) {
  const invocationSections = existingContent.match(/\n## (Claude|Codex) CLI Invocation\n[\s\S]*?(?=\n## |$)/gu) || [];
  return `${nextContent.trimEnd()}${invocationSections.join('')}\n`;
}

export function formatPrerequisitesMarkdown(result) {
  const rows = result.checks
    .map((check) => `| ${check.name} | ${check.required ? 'yes' : 'no'} | ${check.ok ? 'pass' : 'fail'} | ${check.command} | ${check.version} | ${check.notes} |`)
    .join('\n');

  return `# PoC Verification Result

## Environment

- Generated At: ${result.generatedAt}
- OS: ${result.platform}
- Workflow Root: ${result.workflowRoot}
- Workflow Initialized: ${result.workflowInitialized ? 'yes' : 'no'}

## Prerequisites

| Check | Required | Status | Command | Version | Notes |
| --- | --- | --- | --- | --- | --- |
${rows}

## Claude CLI

- Non-interactive execution: run \`dual-ai-poc verify claude\`
- Login status: manual verification required
- Payload mode: pending
- Stdout capture: pending
- Exit code: pending
- Timeout: pending
- Permission prompt: pending

## Codex CLI

- Non-interactive execution: run \`dual-ai-poc verify codex\`
- Login status: manual verification required
- Payload mode: pending
- Stdout capture: pending
- Exit code: pending
- Timeout: pending
- Permission prompt: pending
`;
}
