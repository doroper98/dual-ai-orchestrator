import { initWorkflow } from './init.js';
import { checkPrerequisites } from './prerequisites.js';
import { formatResumeContext, getResumeContext } from './resume.js';
import { formatStatus, getStatus } from './status.js';
import { runTask } from './task.js';
import { runAgentVerification } from './verify.js';
import { runWatch } from './watch.js';

const HELP = `dual-ai-poc

Usage:
  dual-ai-poc init
  dual-ai-poc prerequisites
  dual-ai-poc verify claude
  dual-ai-poc verify codex
  dual-ai-poc run-task <path>
  dual-ai-poc watch
  dual-ai-poc status
  dual-ai-poc resume-context
  dual-ai-poc help

Initial PoC scope:
  - Create the .ai-workflow repository structure.
  - Check local prerequisites.
  - Verify one non-interactive Claude/Codex CLI call.
  - Run one Markdown task file and capture the result.
  - Watch inbox folders and run new Markdown task files.
  - Print the current workflow status.
  - Print resume context and manual handoff text.
`;

export async function runCli(args, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const [command] = args;

  switch (command) {
    case 'init': {
      const result = await initWorkflow({ cwd });
      stdout.write(`Initialized PoC workflow at ${result.workflowRoot}\n`);
      stdout.write(`Created ${result.createdFiles.length} new file(s); existing files were left unchanged.\n`);
      return 0;
    }
    case 'prerequisites': {
      const result = await checkPrerequisites({ cwd });
      for (const check of result.checks) {
        stdout.write(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.version}\n`);
      }
      stdout.write(`Verification written to ${result.workflowRoot}/verification.md\n`);
      if (!result.workflowInitialized) {
        stderr.write('Workflow folder is missing. Run dual-ai-poc init first.\n');
      }
      return result.ok ? 0 : 1;
    }
    case 'verify': {
      const agentName = args[1];
      if (!['claude', 'codex'].includes(agentName)) {
        stderr.write('Usage: dual-ai-poc verify <claude|codex>\n');
        return 1;
      }

      stdout.write(`Running ${agentName} CLI verification...\n`);
      const result = await runAgentVerification(agentName, { cwd });
      stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${agentName} verification\n`);
      if (result.outputPath) {
        stdout.write(`Result written to ${result.outputPath}\n`);
      }
      if (!result.ok) {
        stderr.write(`${agentName} verification failed. Expected marker: ${result.marker}\n`);
      }
      return result.ok ? 0 : 1;
    }
    case 'run-task': {
      const taskPath = args[1];
      if (!taskPath) {
        stderr.write('Usage: dual-ai-poc run-task <path>\n');
        return 1;
      }

      stdout.write(`Running task ${taskPath}...\n`);
      const result = await runTask(taskPath, { cwd });
      stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${result.agent} task ${result.taskId}\n`);
      stdout.write(`Result written to ${result.outputPath}\n`);
      return result.ok ? 0 : 1;
    }
    case 'watch': {
      await runWatch({ cwd, stdout, stderr });
      await new Promise(() => {});
      return 0;
    }
    case 'status': {
      const status = await getStatus({ cwd });
      stdout.write(formatStatus(status));
      return 0;
    }
    case 'resume-context': {
      const context = await getResumeContext({ cwd });
      stdout.write(formatResumeContext(context));
      return 0;
    }
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      stdout.write(`${HELP}\n`);
      return 0;
    default:
      stderr.write(`Unknown command: ${command}\n\n${HELP}\n`);
      return 1;
  }
}
