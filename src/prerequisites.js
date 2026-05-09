import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 5_000;

async function commandExists(command) {
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
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: DEFAULT_TIMEOUT_MS });
    return (stdout || stderr).trim().split('\n')[0] || 'available';
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 'not found';
    }
    const output = `${error?.stdout || ''}${error?.stderr || ''}`.trim().split('\n')[0];
    return output || `available, version check failed: ${error?.message || 'unknown error'}`;
  }
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
        available: 'Claude CLI detected. Login and non-interactive execution are not verified in this initial PoC.',
        missing: 'Install Claude CLI and log in before running future verify commands.',
      },
    }),
    await detectCommand({
      name: 'Codex CLI',
      command: 'codex',
      required: true,
      notes: {
        available: 'Codex CLI detected. Login and non-interactive execution are not verified in this initial PoC.',
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
  const content = formatPrerequisitesMarkdown(result);
  await writeFile(path.join(workflowRoot, 'verification.md'), content);
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

- Non-interactive execution: not implemented in initial PoC
- Login status: manual verification required
- Payload mode: pending
- Stdout capture: pending
- Exit code: pending
- Timeout: pending
- Permission prompt: pending

## Codex CLI

- Non-interactive execution: not implemented in initial PoC
- Login status: manual verification required
- Payload mode: pending
- Stdout capture: pending
- Exit code: pending
- Timeout: pending
- Permission prompt: pending
`;
}
