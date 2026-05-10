import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LIMITS = {
  max_total_calls: 10,
  max_claude_calls: 5,
  max_codex_calls: 5,
  retry_count: 0,
};

export async function readWorkflowConfig({ cwd = process.cwd() } = {}) {
  const configPath = path.join(cwd, '.ai-workflow', 'config.yml');
  let content = '';

  try {
    content = await readFile(configPath, 'utf8');
  } catch {
    return {
      limits: { ...DEFAULT_LIMITS },
    };
  }

  return {
    limits: {
      ...DEFAULT_LIMITS,
      ...parseNumericSection(content, 'limits'),
    },
  };
}

export async function checkCallLimit(agent, { cwd = process.cwd() } = {}) {
  const [{ limits }, events] = await Promise.all([
    readWorkflowConfig({ cwd }),
    readEvents(path.join(cwd, '.ai-workflow', 'events.jsonl')),
  ]);
  const startedEvents = events.filter((event) => event.type === 'agent_started');
  const agentStartedEvents = startedEvents.filter((event) => event.agent === agent);
  const agentLimit = agent === 'claude' ? limits.max_claude_calls : limits.max_codex_calls;

  if (startedEvents.length >= limits.max_total_calls) {
    return {
      ok: false,
      reason: 'call_limit',
      message: `max_total_calls reached (${startedEvents.length}/${limits.max_total_calls})`,
    };
  }

  if (agentStartedEvents.length >= agentLimit) {
    return {
      ok: false,
      reason: 'call_limit',
      message: `max_${agent}_calls reached (${agentStartedEvents.length}/${agentLimit})`,
    };
  }

  return {
    ok: true,
    reason: 'none',
    message: `${agentStartedEvents.length}/${agentLimit} ${agent} calls used; ${startedEvents.length}/${limits.max_total_calls} total calls used`,
  };
}

function parseNumericSection(content, sectionName) {
  const lines = content.split(/\r?\n/u);
  const result = {};
  let inSection = false;

  for (const line of lines) {
    if (/^\S/u.test(line)) {
      inSection = line.trim() === `${sectionName}:`;
      continue;
    }

    if (!inSection) {
      continue;
    }

    const match = line.match(/^\s+([A-Za-z0-9_]+):\s*([0-9]+)\s*$/u);
    if (match) {
      result[match[1]] = Number.parseInt(match[2], 10);
    }
  }

  return result;
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
