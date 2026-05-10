import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseTaskMarkdown, processInboxTask, runTask } from '../src/task.js';

const TASK_MARKDOWN = `# PoC Task

## Task ID

poc-task-001

## Target Agent

codex

## Instructions

Reply with Codex task OK.

## Manual Handoff

Next Agent: claude
`;

test('parseTaskMarkdown reads task id, agent, and default output path', () => {
  const cwd = path.join(os.tmpdir(), 'dual-ai-parse');
  const taskPath = path.join(cwd, '.ai-workflow', 'inbox', 'codex', 'poc-task-001.md');
  const task = parseTaskMarkdown(TASK_MARKDOWN, taskPath, cwd);

  assert.equal(task.agent, 'codex');
  assert.equal(task.taskId, 'poc-task-001');
  assert.equal(task.outputPath, path.join(cwd, '.ai-workflow', 'outbox', 'codex', 'poc-task-001-result.md'));
});

test('runTask executes the requested agent and writes a task result', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-run-task-'));
  const taskPath = path.join(cwd, '.ai-workflow', 'inbox', 'codex', 'poc-task-001.md');
  await mkdir(path.dirname(taskPath), { recursive: true });
  await writeFile(taskPath, TASK_MARKDOWN);

  const result = await runTask(taskPath, {
    cwd,
    commandResolver: async () => 'codex',
    runner: async (_command, _args, { input }) => ({
      exitCode: 0,
      timedOut: false,
      stdout: input.includes('poc-task-001') ? 'Codex task OK\n' : '',
      stderr: '',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'codex');
  assert.equal(result.taskId, 'poc-task-001');

  const output = await readFile(result.outputPath, 'utf8');
  assert.match(output, /Status: pass/);
  assert.match(output, /Failure Reason: none/);
  assert.match(output, /Codex task OK/);
  assert.match(output, /Next Agent: claude/);

  const events = await readFile(path.join(cwd, '.ai-workflow', 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"agent_started"/);
  assert.match(events, /"type":"agent_completed"/);

  const status = await readFile(path.join(cwd, '.ai-workflow', 'shared', 'status.md'), 'utf8');
  assert.match(status, /Last Task: poc-task-001/);

  const ledger = await readFile(path.join(cwd, '.ai-workflow', 'shared', 'context-ledger.md'), 'utf8');
  assert.match(ledger, /Task Completed: poc-task-001/);
});

test('runTask classifies Codex usage limit failures', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-run-task-limit-'));
  const taskPath = path.join(cwd, '.ai-workflow', 'inbox', 'codex', 'poc-task-usage-limit.md');
  await mkdir(path.dirname(taskPath), { recursive: true });
  await writeFile(taskPath, TASK_MARKDOWN.replace('poc-task-001', 'poc-task-usage-limit'));

  const result = await runTask(taskPath, {
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

  const output = await readFile(result.outputPath, 'utf8');
  assert.match(output, /Failure Reason: usage_limit/);

  const status = await readFile(path.join(cwd, '.ai-workflow', 'shared', 'status.md'), 'utf8');
  assert.match(status, /wait for the CLI usage limit reset/);
});

test('processInboxTask moves completed inbox tasks to archive', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-process-task-'));
  const taskPath = path.join(cwd, '.ai-workflow', 'inbox', 'codex', 'poc-task-001.md');
  await mkdir(path.dirname(taskPath), { recursive: true });
  await writeFile(taskPath, TASK_MARKDOWN);

  const result = await processInboxTask(taskPath, {
    cwd,
    commandResolver: async () => 'codex',
    runner: async () => ({
      exitCode: 0,
      timedOut: false,
      stdout: 'Codex task OK\n',
      stderr: '',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.taskPath, path.join(cwd, '.ai-workflow', 'archive', 'codex', 'poc-task-001.md'));

  const archivedTask = await readFile(result.taskPath, 'utf8');
  assert.match(archivedTask, /poc-task-001/);

  const events = await readFile(path.join(cwd, '.ai-workflow', 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"task_archived"/);
});
