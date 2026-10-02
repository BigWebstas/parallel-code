import fs from 'fs';
import path from 'path';

/**
 * In-process replacement for shelling out to `which`/`where`.
 *
 * Spawning a subprocess just to test command existence costs a full process
 * creation per check — on Windows that stalls the main thread (execFileSync)
 * and queues behind antivirus scans, so availability probes and launch
 * validation must not fork. A PATH scan with accessSync answers the same
 * question without creating a process.
 */

interface CommandPathDeps {
  platform?: NodeJS.Platform;
  pathEnv?: string;
  pathextEnv?: string;
  accessSync?: (candidate: string, mode: number) => void;
}

/** True for values that name a file directly instead of a PATH lookup. */
export function isExplicitCommandPath(command: string, platform?: NodeJS.Platform): boolean {
  const plat = platform ?? process.platform;
  if (command.includes('/')) return true;
  if (plat === 'win32' && (command.includes('\\') || /^[a-zA-Z]:/.test(command))) return true;
  return false;
}

/** Suffixes to try for a bare command on Windows. A command that already
 *  carries an executable extension is tried as-is only. */
function executableSuffixes(command: string, pathext: string): string[] {
  const exts = pathext
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`));
  // Probe with PATHEXT's own casing (Windows filesystems ignore case); the
  // already-has-an-extension check compares case-insensitively.
  const lower = exts.map((ext) => ext.toLowerCase());
  if (lower.includes(path.win32.extname(command).toLowerCase())) return [''];
  return ['', ...exts];
}

/** True when `command` resolves to an executable file, without spawning anything. */
export function commandExistsOnPath(command: string, deps: CommandPathDeps = {}): boolean {
  const name = command.trim();
  if (!name) return false;
  const platform = deps.platform ?? process.platform;
  const accessSync =
    deps.accessSync ?? ((candidate: string, mode: number) => fs.accessSync(candidate, mode));
  const isExecutable = (candidate: string): boolean => {
    try {
      accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (isExplicitCommandPath(name, platform)) return isExecutable(name);
  const pathEnv = deps.pathEnv ?? process.env.PATH ?? '';
  const delimiter = platform === 'win32' ? ';' : ':';
  const suffixes =
    platform === 'win32'
      ? executableSuffixes(name, deps.pathextEnv ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
      : [''];
  const joinPath = platform === 'win32' ? path.win32.join : path.join;
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const suffix of suffixes) {
      if (isExecutable(joinPath(dir, `${name}${suffix}`))) return true;
    }
  }
  return false;
}
