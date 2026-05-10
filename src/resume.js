import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getStatus } from './status.js';

export async function getResumeContext({ cwd = process.cwd() } = {}) {
  const workflowRoot = path.join(cwd, '.ai-workflow');
  const [status, ledger, events] = await Promise.all([
    getStatus({ cwd, recentLimit: 8 }),
    readText(path.join(workflowRoot, 'shared', 'context-ledger.md')),
    readEvents(path.join(workflowRoot, 'events.jsonl')),
  ]);
  const lastResultEvent = [...events].reverse().find((event) => event.output_path);
  const lastResultPath = lastResultEvent?.output_path ? path.resolve(cwd, lastResultEvent.output_path) : null;
  const lastResult = lastResultPath ? await readText(lastResultPath) : '';

  return {
    status,
    ledger,
    lastResultPath,
    manualHandoff: extractManualHandoff(lastResult),
  };
}

export function formatResumeContext(context) {
  const lines = [
    'Dual AI Orchestrator Resume Context',
    '',
    `Next Action: ${context.status.nextAction}`,
    `Last Result: ${context.lastResultPath || 'none'}`,
    '',
    'Recent Events:',
  ];

  for (const event of context.status.recentEvents) {
    const task = event.task_id ? ` task=${event.task_id}` : '';
    const agent = event.agent ? ` agent=${event.agent}` : '';
    lines.push(`  ${event.time || 'unknown'} ${event.type || 'unknown'}${agent}${task}`);
  }

  lines.push('', 'Manual Handoff:');
  lines.push(context.manualHandoff || '  none');
  lines.push('', 'Context Ledger:');
  lines.push(indent(trimForDisplay(context.ledger) || 'none'));

  return `${lines.join('\n')}\n`;
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readEvents(eventsPath) {
  const content = await readText(eventsPath);
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

function extractManualHandoff(markdown) {
  const match = markdown.match(/## Manual Handoff\n([\s\S]*?)(?=\n## |$)/u);
  return match?.[1]?.trim() || '';
}

function trimForDisplay(value) {
  const text = value.trim();
  if (text.length <= 2_000) {
    return text;
  }

  return `${text.slice(0, 2_000)}\n\n[truncated ${text.length - 2_000} characters]`;
}

function indent(value) {
  return value
    .split(/\r?\n/u)
    .map((line) => `  ${line}`)
    .join('\n');
}
