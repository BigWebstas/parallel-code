// Cross-platform replacement for `umask <mask> && <command>`; cmd.exe has no umask.
// Usage: node scripts/with-umask.mjs <octal-mask> <command...>.
// Sets the mask for this process (inherited by the child) and runs <command...>
// with inherited stdio, exiting with its code.
/* global console, process */
import { spawnSync } from 'node:child_process';

const [mask, ...command] = process.argv.slice(2);
if (!/^[0-7]{3}$/.test(mask ?? '') || command.length === 0) {
  console.error('usage: with-umask.mjs <octal-mask> <command...>');
  process.exit(2);
}

process.umask(parseInt(mask, 8));
const [cmd, ...args] = command;
const run = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(run.status ?? 1);
