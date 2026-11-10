// Traced child-process runners shared by the git IPC modules.

import { execFile, execFileSync as _execFileSync } from 'child_process';
import { promisify } from 'util';
import { debug as logDebug } from '../log.js';

const _exec = promisify(execFile);

/** Windows git needs long-path support for deep worktree trees such as node_modules. */
function gitArgs(cmd: string, args: string[]): string[] {
  return cmd === 'git' && process.platform === 'win32'
    ? ['-c', 'core.longpaths=true', ...args]
    : args;
}

/**
 * Trace + run a git command (or any execFile invocation).
 * Emits a `debug` entry under category `git` with the args before
 * execution so verbose logs can reconstruct the command stream.
 */
export const exec: typeof _exec = ((cmd: string, args: string[], options?: unknown) => {
  const effectiveArgs = gitArgs(cmd, args);
  if (cmd === 'git') logDebug('git', effectiveArgs.join(' '));
  return (_exec as unknown as (...a: unknown[]) => unknown)(cmd, effectiveArgs, options);
}) as typeof _exec;

export const execFileSync: typeof _execFileSync = ((
  cmd: string,
  args: string[],
  options?: unknown,
) => {
  const effectiveArgs = gitArgs(cmd, args);
  if (cmd === 'git') logDebug('git', effectiveArgs.join(' '));
  return (_execFileSync as unknown as (...a: unknown[]) => unknown)(cmd, effectiveArgs, options);
}) as typeof _execFileSync;

export const MAX_BUFFER = 10 * 1024 * 1024; // 10MB
