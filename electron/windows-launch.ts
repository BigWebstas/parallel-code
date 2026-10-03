import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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

// `where` blocks the main process, and starting a process costs 50-200 ms on
// Windows; every agent, terminal and chat launch looks up one or more programs.
// Remember found programs per PATH, and look again once one has disappeared.
const whereCache = new Map<string, string[]>();

/** Forget remembered `where` results (tests, and after an install changes PATH contents). */
export function clearWindowsCommandCache(): void {
  whereCache.clear();
}

function whereAll(command: string, env: NodeJS.ProcessEnv): string[] {
  const key = `${command}\0${env.PATH ?? env.Path ?? ''}`;
  const cached = whereCache.get(key);
  if (cached?.every((candidate) => fs.existsSync(candidate))) return cached;
  let found: string[];
  try {
    found = execFileSync('where', [command], {
      encoding: 'utf8',
      timeout: 3000,
      env,
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    found = [];
  }
  // A miss is not remembered, so a program installed later is found.
  if (found.length > 0) whereCache.set(key, found);
  else whereCache.delete(key);
  return found;
}

/**
 * What a Windows command name resolves to. `program` is something spawnable
 * without a shell: a real `.exe`/`.com`, or the target an npm `.cmd` shim
 * wraps (its `.exe` or `.js` entry). `batch` is a `.cmd`/`.bat` that is not
 * a recognizable npm shim and can only run through cmd.exe.
 */
export function locateWindowsCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): { program?: string; batch?: string } {
  // `where` also lists the extensionless bash shim npm writes; no Windows
  // loader accepts it, so only extensions count.
  const candidates = path.win32.isAbsolute(command) ? [command] : whereAll(command, env);
  const executable = candidates.find((c) => /\.(exe|com)$/i.test(c));
  if (executable) return { program: executable };
  const batch = candidates.find((c) => /\.(cmd|bat)$/i.test(c));
  const target = batch && readCmdShimTarget(batch);
  if (target) return { program: target };
  const script = candidates.find((c) => SCRIPT_EXT.test(c));
  if (script) return { program: script };
  return batch ? { batch } : {};
}

/**
 * The real program behind an agent command on Windows. Node refuses to spawn a
 * `.cmd` without a shell, and going through cmd.exe would mangle prompt text
 * (newlines, `%`, `^`), so an npm shim is replaced by its target. A `.js`
 * entry is returned as the path itself; use `resolveWindowsLaunch` to get the
 * `node` invocation. Unchanged off Windows and when nothing spawnable is found,
 * so the spawn fails as "not found".
 */
export function resolveWindowsProgram(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return command;
  return locateWindowsCommand(command, env).program ?? command;
}

/** Run a resolved program: `.js` entries go through node, anything else directly. */
export function launchProgram(program: string, args: string[]): Launch {
  return SCRIPT_EXT.test(program)
    ? { file: 'node', args: [program, ...args] }
    : { file: program, args };
}

/** `resolveWindowsProgram` as a spawnable launch. */
export function resolveWindowsLaunch(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Launch {
  return launchProgram(resolveWindowsProgram(command, env, platform), args);
}
