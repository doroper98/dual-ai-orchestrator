import { watch } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { processInboxTask } from './task.js';

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_STABILITY_MS = 250;

export async function runWatch({
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  runner,
  commandResolver,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  stabilityMs = DEFAULT_STABILITY_MS,
} = {}) {
  const inboxRoots = ['claude', 'codex'].map((agent) => path.join(cwd, '.ai-workflow', 'inbox', agent));
  await Promise.all(inboxRoots.map((root) => mkdir(root, { recursive: true })));

  const queue = new Map();
  const active = new Set();

  async function enqueue(filePath) {
    if (!filePath.endsWith('.md') || active.has(filePath)) {
      return;
    }

    clearTimeout(queue.get(filePath));
    queue.set(filePath, setTimeout(async () => {
      queue.delete(filePath);
      active.add(filePath);

      try {
        await waitForStableFile(filePath, { stabilityMs });
        stdout.write(`Detected task ${path.relative(cwd, filePath)}\n`);
        const result = await processInboxTask(filePath, { cwd, runner, commandResolver });
        stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${result.agent} task ${result.taskId}\n`);
      } catch (error) {
        stderr.write(`Failed to process ${path.relative(cwd, filePath)}: ${error instanceof Error ? error.message : String(error)}\n`);
      } finally {
        active.delete(filePath);
      }
    }, debounceMs));
  }

  for (const root of inboxRoots) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        await enqueue(path.join(root, entry.name));
      }
    }
  }

  const watchers = inboxRoots.map((root) => watch(root, (_eventType, fileName) => {
    if (fileName) {
      void enqueue(path.join(root, fileName.toString()));
    }
  }));

  stdout.write(`Watching ${inboxRoots.map((root) => path.relative(cwd, root)).join(', ')}\n`);

  return {
    close() {
      for (const timer of queue.values()) {
        clearTimeout(timer);
      }
      queue.clear();
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

async function waitForStableFile(filePath, { stabilityMs }) {
  let previousSize = -1;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const current = await stat(filePath);
    if (current.size === previousSize) {
      return;
    }
    previousSize = current.size;
    await delay(stabilityMs);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
