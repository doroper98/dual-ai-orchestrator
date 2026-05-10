import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAgentVerification } from '../src/verify.js';

test('runAgentVerification records a passing agent invocation', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-verify-'));
  const result = await runAgentVerification('codex', {
    cwd,
    commandResolver: async () => 'codex',
    runner: async (_command, _args, { input }) => ({
      exitCode: 0,
      timedOut: false,
      stdout: input.includes('Codex PoC OK') ? 'Codex PoC OK\n' : '',
      stderr: '',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.marker, 'Codex PoC OK');
  assert.equal(result.failureReason, 'none');

  const output = await readFile(result.outputPath, 'utf8');
  assert.match(output, /Status: pass/);
  assert.match(output, /Codex PoC OK/);
});

test('runAgentVerification fails when the expected marker is missing', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-verify-missing-marker-'));
  const result = await runAgentVerification('claude', {
    cwd,
    commandResolver: async () => 'claude',
    runner: async () => ({
      exitCode: 0,
      timedOut: false,
      stdout: 'unexpected output\n',
      stderr: '',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.failureReason, 'agent_error');

  const output = await readFile(result.outputPath, 'utf8');
  assert.match(output, /Status: fail/);
  assert.match(output, /Failure Reason: agent_error/);
  assert.match(output, /unexpected output/);
});

test('runAgentVerification classifies usage limit failures', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-verify-usage-limit-'));
  const result = await runAgentVerification('codex', {
    cwd,
    commandResolver: async () => 'codex',
    runner: async () => ({
      exitCode: 1,
      timedOut: false,
      stdout: '',
      stderr: 'ERROR: You have hit your usage limit. Try again at May 10th, 2026 12:39 AM.',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.failureReason, 'usage_limit');

  const output = await readFile(result.outputPath, 'utf8');
  assert.match(output, /Failure Reason: usage_limit/);
});
