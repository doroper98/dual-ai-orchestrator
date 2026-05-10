import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatStatus, getStatus } from '../src/status.js';

test('getStatus summarizes queues, verification, and recent events', async () => {
  const cwd = await mkdirTempWorkflow();
  await writeFile(path.join(cwd, '.ai-workflow', 'inbox', 'claude', 'task-1.md'), '# Task\n');
  await writeFile(path.join(cwd, '.ai-workflow', 'archive', 'codex', 'task-2.md'), '# Task\n');
  await writeFile(path.join(cwd, '.ai-workflow', 'verification.md'), `# PoC Verification Result

| Claude CLI | yes | pass | claude | 1 | ok |
| Codex CLI | yes | pass | codex | 1 | ok |

## Claude CLI Invocation

- Status: pass

## Codex CLI Invocation

- Status: pass
`);
  await appendFile(path.join(cwd, '.ai-workflow', 'events.jsonl'), `${JSON.stringify({
    time: '2026-05-09T00:00:00.000Z',
    type: 'agent_completed',
    agent: 'codex',
    task_id: 'task-2',
  })}\n`);

  const status = await getStatus({ cwd });

  assert.equal(status.verification.prerequisites, 'pass');
  assert.equal(status.verification.claudeInvocation, 'pass');
  assert.equal(status.queues.inbox.claude, 1);
  assert.equal(status.queues.archive.codex, 1);
  assert.equal(status.totals.completed, 1);
  assert.match(status.nextAction, /watch|run-task/);

  const output = formatStatus(status);
  assert.match(output, /Dual AI Orchestrator Status/);
  assert.match(output, /inbox: claude=1 codex=0/);
  assert.match(output, /agent_completed/);
});

test('getStatus suggests waiting when verification hit a usage limit', async () => {
  const cwd = await mkdirTempWorkflow();
  await writeFile(path.join(cwd, '.ai-workflow', 'verification.md'), `| Claude CLI | yes | pass | claude | 1 | ok |
| Codex CLI | yes | pass | codex | 1 | ok |
## Claude CLI Invocation
- Status: pass
- Failure Reason: none
## Codex CLI Invocation
- Status: fail
- Failure Reason: usage_limit
`);

  const status = await getStatus({ cwd });

  assert.equal(status.verification.codexInvocation, 'fail');
  assert.equal(status.verification.codexFailureReason, 'usage_limit');
  assert.match(status.nextAction, /usage limit reset/);
});

async function mkdirTempWorkflow() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-status-'));
  const agents = ['claude', 'codex'];
  const queues = ['inbox', 'processing', 'outbox', 'archive', 'failed'];

  for (const queue of queues) {
    for (const agent of agents) {
      await mkdir(path.join(cwd, '.ai-workflow', queue, agent), { recursive: true });
    }
  }

  return cwd;
}
