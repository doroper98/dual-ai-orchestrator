import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatCostReport, getCostReport } from '../src/cost-report.js';

test('getCostReport counts calls against configured limits', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dual-ai-cost-report-'));
  const workflowRoot = path.join(cwd, '.ai-workflow');
  await mkdir(workflowRoot, { recursive: true });
  await writeFile(path.join(workflowRoot, 'config.yml'), `limits:
  max_total_calls: 4
  max_claude_calls: 2
  max_codex_calls: 2
`);
  await appendFile(path.join(workflowRoot, 'events.jsonl'), [
    { type: 'agent_started', agent: 'claude' },
    { type: 'agent_started', agent: 'codex' },
    { type: 'agent_failed', agent: 'codex', failure_reason: 'usage_limit' },
  ].map((event) => JSON.stringify(event)).join('\n'));

  const report = await getCostReport({ cwd });

  assert.equal(report.calls.total, 2);
  assert.equal(report.remaining.total, 2);
  assert.equal(report.remaining.claude, 1);
  assert.equal(report.remaining.codex, 1);
  assert.equal(report.usageLimitFailures, 1);

  const output = formatCostReport(report);
  assert.match(output, /total: 2\/4/);
  assert.match(output, /usage limit: 1/);
});
