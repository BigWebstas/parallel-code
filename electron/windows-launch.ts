import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** A program child_process.spawn can start without a shell. */
export interface Launch {
  file: string;
  args: string[];
}

const SCRIPT_EXT = /\.(c|m)?js$/i;

/**
 * The program an npm `.cmd` shim runs: the last `"%dp0%\…"` (or `%~dp0`) path
 * in the file, which follows the optional bundled `node.exe`.
 */
export function readCmdShimTarget(shimPath: string): string | undefined {
  let text: string;
  try {
    text = fs.readFileSync(shimPath, 'utf8');
  } catch {
    return undefined;
  }
  const targets = [...text.matchAll(/"%~?dp0%?\\([^"]+)"/gi)]
    .map((m) => m[1])
    .filter((rel) => !/^node\.exe$/i.test(rel));
  const rel = targets[targets.length - 1];
  return rel ? path.win32.join(path.win32.dirname(shimPath), rel) : undefined;
}

function whereAll(command: string, env: NodeJS.ProcessEnv): string[] {
  try {
    return execFileSync('where', [command], {
      encoding: 'utf8',
      timeout: 3000,
      env,
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The real program behind an agent command on Windows. Node refuses to spawn a
 * `.cmd` without a shell, and going through cmd.exe would mangle prompt text
 * (newlines, `%`, `^`), so an npm shim is replaced by its target: the `.exe` it
 * wraps, or its `.js` entry. A `.js` entry is returned as the path itself; use
 * `resolveWindowsLaunch` to get the `node` invocation. Unchanged off Windows and
 * when nothing launchable is found, so the spawn fails as "not found".
 */
export function resolveWindowsProgram(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return command;
  const candidates = path.win32.isAbsolute(command) ? [command] : whereAll(command, env);
  const executable = candidates.find((c) => /\.(exe|com)$/i.test(c));
  if (executable) return executable;
  const shim = candidates.find((c) => /\.(cmd|bat)$/i.test(c));
  const target = shim && readCmdShimTarget(shim);
  return target ?? candidates.find((c) => SCRIPT_EXT.test(c)) ?? command;
}

/** `resolveWindowsProgram` as a spawnable launch, running `.js` entries with node. */
export function resolveWindowsLaunch(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Launch {
  const program = resolveWindowsProgram(command, env, platform);
  return SCRIPT_EXT.test(program)
    ? { file: 'node', args: [program, ...args] }
    : { file: program, args };
}
