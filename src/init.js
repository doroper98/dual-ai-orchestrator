import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const WORKFLOW_DIRECTORIES = [
  'shared',
  'inbox/claude',
  'inbox/codex',
  'outbox/claude',
  'outbox/codex',
  'processing/claude',
  'processing/codex',
  'archive/claude',
  'archive/codex',
  'failed/claude',
  'failed/codex',
];

const CONFIG_TEMPLATE = `agents:
  claude:
    command: claude
    model: manual
    payload_mode: stdin
    args:
      - "-p"
    permission_args:
      - "<verification-required>"
    timeout_seconds: 300

  codex:
    command: codex
    model: manual
    payload_mode: stdin
    args:
      - "exec"
    permission_args:
      - "<verification-required>"
    timeout_seconds: 300

limits:
  max_total_calls: 10
  max_claude_calls: 5
  max_codex_calls: 5
  retry_count: 0

workflow:
  mode: semi_auto
  require_manual_approval: true
  default_next_agent: manual
  output_capture: stdout
`;

const VERIFICATION_TEMPLATE = `# PoC Verification Result

## Environment

- OS: pending
- PowerShell version: pending
- Node.js version: pending
- Claude CLI version: pending
- Codex CLI version: pending
- Git version: pending

## Prerequisites

Run \`dual-ai-poc prerequisites\` to populate this section.

## Claude CLI

- Non-interactive execution: run \`dual-ai-poc verify claude\`
- Payload mode: pending
- Stdout capture: pending
- Exit code: pending
- Timeout: pending
- Permission prompt: pending

## Codex CLI

- Non-interactive execution: run \`dual-ai-poc verify codex\`
- Payload mode: pending
- Stdout capture: pending
- Exit code: pending
- Timeout: pending
- Permission prompt: pending
`;

const CONTEXT_LEDGER_TEMPLATE = `# Context Ledger

## Current State

- Phase: initialized
- Last Actor: user
- Next Actor: manual
- Current Task: none

## Narrative

Initial PoC repository structure has been created. Run prerequisites first, then verify one Claude/Codex invocation at a time.

## Manual Handoff

"초기 PoC 구조와 prerequisites 점검 결과를 확인해줘: .ai-workflow/verification.md"

## Resume Files

- .ai-workflow/shared/status.md
- .ai-workflow/events.jsonl
- .ai-workflow/verification.md
`;

const STATUS_TEMPLATE = `# PoC Status

- Phase: initialized
- Mode: semi_auto
- Claude invocation: run dual-ai-poc verify claude
- Codex invocation: run dual-ai-poc verify codex
- Next action: run dual-ai-poc prerequisites, then run dual-ai-poc verify claude and dual-ai-poc verify codex
`;

async function writeFileIfMissing(filePath, content, createdFiles) {
  try {
    await writeFile(filePath, content, { flag: 'wx' });
    createdFiles.push(filePath);
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function initWorkflow({ cwd = process.cwd() } = {}) {
  const workflowRoot = path.join(cwd, '.ai-workflow');
  const createdFiles = [];
  const createdDirectories = [];

  await mkdir(workflowRoot, { recursive: true });
  createdDirectories.push(workflowRoot);

  for (const relativeDirectory of WORKFLOW_DIRECTORIES) {
    const directoryPath = path.join(workflowRoot, relativeDirectory);
    await mkdir(directoryPath, { recursive: true });
    createdDirectories.push(directoryPath);
  }

  await writeFileIfMissing(path.join(workflowRoot, 'config.yml'), CONFIG_TEMPLATE, createdFiles);
  await writeFileIfMissing(path.join(workflowRoot, 'events.jsonl'), '', createdFiles);
  await writeFileIfMissing(path.join(workflowRoot, 'verification.md'), VERIFICATION_TEMPLATE, createdFiles);
  await writeFileIfMissing(path.join(workflowRoot, 'shared', 'context-ledger.md'), CONTEXT_LEDGER_TEMPLATE, createdFiles);
  await writeFileIfMissing(path.join(workflowRoot, 'shared', 'status.md'), STATUS_TEMPLATE, createdFiles);

  return {
    workflowRoot,
    createdDirectories,
    createdFiles,
  };
}

export { WORKFLOW_DIRECTORIES };
