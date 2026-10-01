// Cross-platform replacement for `command -v <tool> >/dev/null 2>&1 && <tool> ...`.
// Usage: node scripts/require-tool.mjs <tool> <install-hint> <command...>.
// Exits 1 with the hint when <tool> is not on PATH; otherwise runs <command...>
// with inherited stdio and exits with its code. Works in cmd.exe, PowerShell,
// and POSIX shells alike.
/* global console, process */
import { spawnSync } from 'node:child_process';

const [tool, hint, ...command] = process.argv.slice(2);
if (!tool || command.length === 0) {
  console.error('usage: require-tool.mjs <tool> <install-hint> <command...>');
  process.exit(2);
}

const probe = spawnSync(tool, ['--version'], { stdio: 'ignore', shell: false });
if (probe.error && probe.error.code === 'ENOENT') {
  console.error(`${tool} not installed (${hint})`);
  process.exit(1);
}

const [cmd, ...args] = command;
const run = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(run.status ?? 1);
