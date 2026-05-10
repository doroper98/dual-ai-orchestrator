import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initWorkflow, WORKFLOW_DIRECTORIES } from '../src/init.js';

test('initWorkflow creates the PoC workflow structure and templates', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-init-'));
  const result = await initWorkflow({ cwd });

  assert.equal(result.workflowRoot, path.join(cwd, '.ai-workflow'));
  assert.equal(result.createdFiles.length, 5);

  for (const relativeDirectory of WORKFLOW_DIRECTORIES) {
    assert.ok(result.createdDirectories.includes(path.join(cwd, '.ai-workflow', relativeDirectory)));
  }

  const config = await readFile(path.join(cwd, '.ai-workflow', 'config.yml'), 'utf8');
  assert.match(config, /claude:/);
  assert.match(config, /codex:/);
  assert.match(config, /retry_count: 0/);

  const contextLedger = await readFile(path.join(cwd, '.ai-workflow', 'shared', 'context-ledger.md'), 'utf8');
  assert.match(contextLedger, /verify one Claude\/Codex invocation at a time/);
});

test('initWorkflow leaves existing files unchanged', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-init-idempotent-'));

  await initWorkflow({ cwd });
  await initWorkflow({ cwd });

  const status = await readFile(path.join(cwd, '.ai-workflow', 'shared', 'status.md'), 'utf8');
  assert.match(status, /Next action: run dual-ai-poc prerequisites/);
  assert.match(status, /dual-ai-poc verify claude/);
  assert.match(status, /dual-ai-poc verify codex/);
});
