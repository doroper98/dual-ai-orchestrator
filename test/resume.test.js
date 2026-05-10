import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatResumeContext, getResumeContext } from '../src/resume.js';

test('getResumeContext returns last result manual handoff and ledger', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-resume-'));
  const workflowRoot = path.join(cwd, '.ai-workflow');
  const resultPath = path.join(workflowRoot, 'outbox', 'codex', 'task-1-result.md');

  await mkdir(path.dirname(resultPath), { recursive: true });
  await mkdir(path.join(workflowRoot, 'shared'), { recursive: true });
  await writeFile(path.join(workflowRoot, 'verification.md'), `| Claude CLI | yes | pass | claude | 1 | ok |
| Codex CLI | yes | pass | codex | 1 | ok |
## Claude CLI Invocation
- Status: pass
## Codex CLI Invocation
- Status: pass
`);
  await writeFile(path.join(workflowRoot, 'shared', 'context-ledger.md'), '# Context Ledger\n\nCurrent task: task-1\n');
  await writeFile(resultPath, `# Task Result

## Manual Handoff

Next Agent: claude

Paste This:

"Continue from task-1"
`);
  await appendFile(path.join(workflowRoot, 'events.jsonl'), `${JSON.stringify({
    time: '2026-05-09T00:00:00.000Z',
    type: 'agent_completed',
    agent: 'codex',
    task_id: 'task-1',
    output_path: path.relative(cwd, resultPath),
  })}\n`);

  const context = await getResumeContext({ cwd });

  assert.equal(context.lastResultPath, resultPath);
  assert.match(context.manualHandoff, /Continue from task-1/);
  assert.match(context.ledger, /Current task/);

  const output = formatResumeContext(context);
  assert.match(output, /Dual AI Orchestrator Resume Context/);
  assert.match(output, /Manual Handoff/);
  assert.match(output, /Context Ledger/);
});
