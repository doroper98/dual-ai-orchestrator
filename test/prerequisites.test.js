import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkPrerequisites, formatPrerequisitesMarkdown, resolveCommandCheck } from '../src/prerequisites.js';

test('formatPrerequisitesMarkdown documents pending AI invocation checks', () => {
  const markdown = formatPrerequisitesMarkdown({
    generatedAt: '2026-05-09T00:00:00.000Z',
    platform: 'TestOS',
    workflowRoot: '/tmp/project/.ai-workflow',
    workflowInitialized: true,
    checks: [
      {
        name: 'Node.js',
        command: 'node',
        required: true,
        ok: true,
        version: 'v20.0.0',
        notes: 'ok',
      },
    ],
  });

  assert.match(markdown, /\| Node\.js \| yes \| pass \| node \| v20\.0\.0 \| ok \|/);
  assert.match(markdown, /Non-interactive execution: not implemented in initial PoC/);
  assert.match(markdown, /Login status: manual verification required/);
});

test('checkPrerequisites reports missing workflow initialization without writing files', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-prereq-'));
  const result = await checkPrerequisites({ cwd, writeVerification: false });

  assert.equal(result.workflowInitialized, false);
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((check) => check.name === 'Node.js' && check.ok));
});

test('resolveCommandCheck fails required tools when the version probe reports not found', () => {
  const check = resolveCommandCheck({
    name: 'Claude CLI',
    command: 'claude',
    required: true,
    exists: true,
    version: 'not found',
    notes: {
      available: 'Claude CLI detected.',
      missing: 'Install Claude CLI.',
    },
  });

  assert.equal(check.ok, false);
  assert.equal(check.version, 'not found');
  assert.equal(check.notes, 'Install Claude CLI.');
});

