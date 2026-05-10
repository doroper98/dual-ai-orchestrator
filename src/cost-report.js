import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readWorkflowConfig } from './config.js';

export async function getCostReport({ cwd = process.cwd() } = {}) {
  const [{ limits }, events] = await Promise.all([
    readWorkflowConfig({ cwd }),
    readEvents(path.join(cwd, '.ai-workflow', 'events.jsonl')),
  ]);
  const startedEvents = events.filter((event) => event.type === 'agent_started');
  const claudeCalls = startedEvents.filter((event) => event.agent === 'claude').length;
  const codexCalls = startedEvents.filter((event) => event.agent === 'codex').length;

  return {
    calls: {
      total: startedEvents.length,
      claude: claudeCalls,
      codex: codexCalls,
    },
    limits: {
      total: limits.max_total_calls,
      claude: limits.max_claude_calls,
      codex: limits.max_codex_calls,
    },
    remaining: {
      total: Math.max(0, limits.max_total_calls - startedEvents.length),
      claude: Math.max(0, limits.max_claude_calls - claudeCalls),
      codex: Math.max(0, limits.max_codex_calls - codexCalls),
    },
    failed: events.filter((event) => event.type === 'agent_failed').length,
    usageLimitFailures: events.filter((event) => event.failure_reason === 'usage_limit').length,
    callLimitFailures: events.filter((event) => event.failure_reason === 'call_limit').length,
  };
}

export function formatCostReport(report) {
  return `Dual AI Orchestrator Cost Report

Calls:
  total: ${report.calls.total}/${report.limits.total} (${report.remaining.total} remaining)
  claude: ${report.calls.claude}/${report.limits.claude} (${report.remaining.claude} remaining)
  codex: ${report.calls.codex}/${report.limits.codex} (${report.remaining.codex} remaining)

Failures:
  agent failed: ${report.failed}
  usage limit: ${report.usageLimitFailures}
  call limit: ${report.callLimitFailures}

Note: This report counts CLI invocations. It does not estimate tokens or dollars.
`;
}

async function readEvents(eventsPath) {
  let content = '';
  try {
    content = await readFile(eventsPath, 'utf8');
  } catch {
    return [];
  }

  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'invalid_event', raw: line };
      }
    });
}
