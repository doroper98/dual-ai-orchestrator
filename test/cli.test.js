import assert from 'node:assert/strict';
import test from 'node:test';
import { runCli } from '../src/cli.js';

function createWritableBuffer() {
  let value = '';
  return {
    write(chunk) {
      value += chunk;
    },
    value() {
      return value;
    },
  };
}

test('runCli returns a failing exit code for unknown commands', async () => {
  const stdout = createWritableBuffer();
  const stderr = createWritableBuffer();

  const exitCode = await runCli(['unknown'], { stdout, stderr });

  assert.equal(exitCode, 1);
  assert.match(stderr.value(), /Unknown command: unknown/);
  assert.equal(stdout.value(), '');
});

test('runCli prints help for empty arguments', async () => {
  const stdout = createWritableBuffer();
  const stderr = createWritableBuffer();

  const exitCode = await runCli([], { stdout, stderr });

  assert.equal(exitCode, 0);
  assert.match(stdout.value(), /dual-ai-poc init/);
  assert.equal(stderr.value(), '');
});
