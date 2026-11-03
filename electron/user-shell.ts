import fs from 'fs';
import * as os from 'os';
import path from 'path';
import { locateWindowsCommand } from './windows-launch.js';

interface ResolveUserShellDeps {
  userInfo?: () => { shell: string | null | undefined };
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  canUseShell?: (shell: string) => boolean;
  /** Finds a program on PATH; injectable so tests need no real PowerShell. */
  findProgram?: (name: string, env: NodeJS.ProcessEnv) => string | undefined;
}

function normalizeShell(shell: string | null | undefined): string | null {
  const value = shell?.trim();
  return value ? value : null;
}

function isExecutablePosixShell(shell: string): boolean {
  try {
    fs.accessSync(shell, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Shell for scripted one-line commands. Windows keeps cmd.exe: its `&&` chaining works
 *  everywhere and it has no execution policy to block npm's .ps1 shims. */
export function resolveUserShell(deps: ResolveUserShellDeps = {}): string {
  return resolveShell(deps, (env) => env.COMSPEC || 'cmd.exe');
}

/** Shell for interactive terminals. Windows opens PowerShell rather than cmd.exe:
 *  PowerShell 7 (`pwsh`) when installed, otherwise the built-in Windows PowerShell. */
export function resolveTerminalShell(deps: ResolveUserShellDeps = {}): string {
  const findProgram = deps.findProgram ?? ((name, env) => locateWindowsCommand(name, env).program);
  return resolveShell(
    deps,
    (env) =>
      findProgram('pwsh', env) ??
      path.win32.join(
        env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
  );
}

function resolveShell(
  deps: ResolveUserShellDeps,
  windowsDefault: (env: NodeJS.ProcessEnv) => string,
): string {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const userInfo = deps.userInfo ?? os.userInfo;
  const canUseShell =
    deps.canUseShell ?? ((shell: string) => platform === 'win32' || isExecutablePosixShell(shell));

  try {
    const osShell = normalizeShell(userInfo().shell);
    if (osShell && canUseShell(osShell)) return osShell;
  } catch {
    // Fall back to inherited environment if the OS lookup is unavailable.
  }

  const envShell = normalizeShell(env.SHELL);
  if (envShell && canUseShell(envShell)) return envShell;

  return platform === 'win32' ? windowsDefault(env) : '/bin/sh';
}

/**
 * Shell-specific argv for running `command`. POSIX shells take `-c`;
 * cmd.exe needs `/d /s /c` (`/d` skips AutoRun, `/s` keeps quoting sane) and
 * PowerShell needs `-Command`. Without this, `cmd.exe -c "..."` treats `-c`
 * as a file name and the run fails on Windows.
 */
export function shellSpawnArgs(shell: string, command: string): string[] {
  const base = path.win32.basename(shell).toLowerCase();
  if (base === 'cmd.exe' || base === 'cmd') return ['/d', '/s', '/c', command];
  if (base === 'powershell.exe' || base === 'powershell' || base === 'pwsh.exe' || base === 'pwsh')
    return ['-NoLogo', '-NoProfile', '-Command', command];
  return ['-c', command];
}
