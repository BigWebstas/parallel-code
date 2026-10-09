import { execFile } from 'child_process';
import { promisify } from 'util';
import { debug as logDebug, warn as logWarn } from '../log.js';

const exec = promisify(execFile);

/**
 * Compiling the helper and walking every process takes a couple of seconds on an
 * idle machine; endpoint-security scanners can stretch the compile far longer.
 */
const SCAN_TIMEOUT_MS = 60_000;
const KILL_TIMEOUT_MS = 10_000;

/**
 * Names that must never be ended because they hold a folder open: the shell
 * the user browses with, and Parallel Code itself. Matched case-insensitively
 * against the process name without `.exe`.
 */
const PROTECTED_NAMES = new Set(['explorer', 'parallel code', 'electron']);

export interface WorktreeLocker {
  pid: number;
  /** Process name without extension, as Windows reports it. */
  name: string;
}

/**
 * Reads another process's current directory from its PEB. Windows offers no
 * documented call for this, and a working directory inside a worktree is
 * exactly what makes `rmdir` fail with EBUSY while no agent is left running —
 * `taskkill /T` follows parent links only, so orphans escape it.
 * Same-user, 64-bit processes only; anything else reports null.
 */
const CWD_READER = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PcCwd {
  [StructLayout(LayoutKind.Sequential)]
  struct PBI { public IntPtr Exit; public IntPtr Peb; public IntPtr Aff; public IntPtr Prio; public IntPtr Pid; public IntPtr Parent; }
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int c, ref PBI i, int len, out int ret);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int a, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr b, byte[] buf, int n, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static byte[] Read(IntPtr h, long addr, int n) {
    var buf = new byte[n]; IntPtr got;
    return ReadProcessMemory(h, new IntPtr(addr), buf, n, out got) && got.ToInt64() == n ? buf : null;
  }
  public static string Get(int pid) {
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      var pbi = new PBI(); int ret;
      if (NtQueryInformationProcess(h, 0, ref pbi, Marshal.SizeOf(pbi), out ret) != 0) return null;
      var pp = Read(h, pbi.Peb.ToInt64() + 0x20, 8); if (pp == null) return null;
      var us = Read(h, BitConverter.ToInt64(pp, 0) + 0x38, 16); if (us == null) return null;
      int len = BitConverter.ToUInt16(us, 0); long buf = BitConverter.ToInt64(us, 8);
      if (len == 0 || buf == 0) return null;
      var str = Read(h, buf, len); if (str == null) return null;
      return Encoding.Unicode.GetString(str);
    } finally { CloseHandle(h); }
  }
}`;

const SCAN_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CWD_READER}
'@
$root = [IO.Path]::GetFullPath($env:PC_LOCK_ROOT).TrimEnd('\\')
foreach ($p in [Diagnostics.Process]::GetProcesses()) {
  try { $cwd = [PcCwd]::Get($p.Id) } catch { continue }
  if (-not $cwd) { continue }
  $cwd = $cwd.TrimEnd('\\')
  if ($cwd -eq $root -or $cwd.StartsWith($root + '\\', [StringComparison]::OrdinalIgnoreCase)) {
    "$($p.Id)\`t$($p.ProcessName)"
  }
}`;

/**
 * The useful parts of an execFile failure. `String(err)` embeds the whole
 * command line — here a multi-kilobyte encoded script — and none of the cause.
 */
function describeExecFailure(err: unknown): Record<string, unknown> {
  const e = err as { code?: unknown; killed?: unknown; signal?: unknown; stderr?: unknown };
  const stderr = typeof e.stderr === 'string' ? e.stderr : '';
  return {
    code: e.code,
    timedOut: e.killed === true,
    signal: e.signal,
    // PowerShell wraps errors in CLIXML; drop the tags so the message is readable.
    stderr: stderr
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500),
  };
}

/** Parse the scanner's `pid<TAB>name` lines, ignoring anything else it printed. */
export function parseLockerOutput(stdout: string): WorktreeLocker[] {
  const lockers: WorktreeLocker[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(\d+)\t(.+)$/.exec(line.trim());
    if (match) lockers.push({ pid: Number(match[1]), name: match[2] });
  }
  return lockers;
}

/**
 * Processes whose working directory is inside `root`. Windows only: elsewhere,
 * and whenever the scan cannot run, it returns an empty list — callers treat
 * "no known holder" the same as "could not look".
 */
export async function findWorktreeLockers(root: string): Promise<WorktreeLocker[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(SCAN_SCRIPT, 'utf16le').toString('base64'),
      ],
      {
        env: { ...process.env, PC_LOCK_ROOT: root },
        timeout: SCAN_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    const lockers = parseLockerOutput(stdout);
    logDebug('git', 'findWorktreeLockers: scan finished', { root, found: lockers.length });
    return lockers;
  } catch (err) {
    logWarn('git', 'findWorktreeLockers: scan failed, no holders will be reported', {
      root,
      ...describeExecFailure(err),
    });
    return [];
  }
}

function isProtected(locker: WorktreeLocker): boolean {
  return (
    locker.pid === process.pid ||
    locker.pid === process.ppid ||
    PROTECTED_NAMES.has(locker.name.toLowerCase())
  );
}

/** Split holders into those safe to end and those that must be left alone. */
export function partitionLockers(lockers: WorktreeLocker[]): {
  killable: WorktreeLocker[];
  kept: WorktreeLocker[];
} {
  const killable: WorktreeLocker[] = [];
  const kept: WorktreeLocker[] = [];
  for (const locker of lockers) (isProtected(locker) ? kept : killable).push(locker);
  return { killable, kept };
}

/** End each process and its children. Failures are logged; the caller retries removal anyway. */
export async function killWorktreeLockers(lockers: WorktreeLocker[]): Promise<void> {
  await Promise.all(
    lockers.map(async (locker) => {
      logWarn('git', 'Ending process that holds a worktree being removed', { ...locker });
      try {
        await exec('taskkill', ['/PID', String(locker.pid), '/T', '/F'], {
          timeout: KILL_TIMEOUT_MS,
          windowsHide: true,
        });
      } catch (err) {
        logWarn('git', 'killWorktreeLockers: taskkill failed', {
          ...locker,
          ...describeExecFailure(err),
        });
      }
    }),
  );
}

/** `name (pid 123), other (pid 456)` for error messages. */
function describeLockers(lockers: WorktreeLocker[]): string {
  return lockers.map((l) => `${l.name} (pid ${l.pid})`).join(', ');
}

/**
 * Explain a Windows worktree removal failure in actionable terms: the raw
 * EPERM/EBUSY/ENOTEMPTY error alone gives the user nothing to act on.
 */
export function lockedRemovalError(
  worktreePath: string,
  cause: unknown,
  holders: WorktreeLocker[] = [],
): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const who =
    holders.length > 0
      ? `Processes with that folder as their working directory: ${describeLockers(holders)}. `
      : 'A process (agent, editor, or terminal) may still hold files open inside it. ';
  return new Error(
    `Cannot remove worktree "${worktreePath}": ${detail}. ${who}` +
      'Close anything using that folder, then close the task again to retry.',
  );
}
