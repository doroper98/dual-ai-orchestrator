import { initWorkflow } from './init.js';
import { checkPrerequisites } from './prerequisites.js';

const HELP = `dual-ai-poc

Usage:
  dual-ai-poc init
  dual-ai-poc prerequisites
  dual-ai-poc help

Initial PoC scope:
  - Create the .ai-workflow repository structure.
  - Check local prerequisites without invoking Claude/Codex for AI work.
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
