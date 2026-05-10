import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runWatch } from '../src/watch.js';

const TASK_MARKDOWN = `# PoC Task

## Task ID

poc-watch-001

## Target Agent

codex

## Instructions

Reply with Codex watch OK.
`;

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

test('runWatch processes a new inbox task once', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-watch-'));
  const stdout = createWritableBuffer();
  const stderr = createWritableBuffer();
  let calls = 0;

  const watcher = await runWatch({
    cwd,
    stdout,
    stderr,
    debounceMs: 20,
    stabilityMs: 20,
    commandResolver: async () => 'codex',
    runner: async () => {
      calls += 1;
      return {
        exitCode: 0,
        timedOut: false,
        stdout: 'Codex watch OK\n',
        stderr: '',
      };
    },
  });

  try {
    const taskPath = path.join(cwd, '.ai-workflow', 'inbox', 'codex', 'poc-watch-001.md');
    await writeFile(taskPath, TASK_MARKDOWN);

    const resultPath = path.join(cwd, '.ai-workflow', 'outbox', 'codex', 'poc-watch-001-result.md');
    await waitFor(async () => {
      try {
        await access(resultPath);
        return true;
      } catch {
        return false;
      }
    });
    const output = await readFile(resultPath, 'utf8');
    assert.match(output, /Codex watch OK/);
    assert.equal(stderr.value(), '');
  } finally {
    watcher.close();
  }
});

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }

  assert.fail('timed out waiting for condition');
}
