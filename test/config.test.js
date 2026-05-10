import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkCallLimit, readWorkflowConfig } from '../src/config.js';

test('readWorkflowConfig parses numeric limits from config.yml', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-config-'));
  const workflowRoot = path.join(cwd, '.ai-workflow');
  await mkdir(workflowRoot, { recursive: true });
  await writeFile(path.join(workflowRoot, 'config.yml'), `limits:
  max_total_calls: 3
  max_claude_calls: 1
  max_codex_calls: 2
  retry_count: 0
`);

  const config = await readWorkflowConfig({ cwd });

  assert.equal(config.limits.max_total_calls, 3);
  assert.equal(config.limits.max_claude_calls, 1);
  assert.equal(config.limits.max_codex_calls, 2);
});

test('checkCallLimit blocks when an agent limit is reached', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-call-limit-'));
  const workflowRoot = path.join(cwd, '.ai-workflow');
  await mkdir(workflowRoot, { recursive: true });
  await writeFile(path.join(workflowRoot, 'config.yml'), `limits:
  max_total_calls: 10
  max_claude_calls: 1
  max_codex_calls: 5
`);
  await appendFile(path.join(workflowRoot, 'events.jsonl'), `${JSON.stringify({
    type: 'agent_started',
    agent: 'claude',
    task_id: 'task-1',
  })}\n`);

  const result = await checkCallLimit('claude', { cwd });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'call_limit');
  assert.match(result.message, /max_claude_calls/);
});
