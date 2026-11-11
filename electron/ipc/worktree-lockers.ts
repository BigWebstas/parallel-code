import { debug as logDebug, warn as logWarn } from '../log.js';
import { appExecFile } from './git-exec.js';

const exec = appExecFile;

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
  /** How it was found: its working directory, or the folder named in its command line. */
  via?: string;
}

/**
 * Reads another process's current directory from its PEB. Windows offers no
 * documented call for this, and a working directory inside a worktree is
 * exactly what makes `rmdir` fail with EBUSY while no agent is left running —
 * `taskkill /T` follows parent links only, so orphans escape it.
 * Same-user, 64-bit processes only; anything else reports null.
 */
const CWD_READER = `
public static class PcCwd {
  [StructLayout(LayoutKind.Sequential)]
  struct PBI { public IntPtr Exit; public IntPtr Peb; public IntPtr Aff; public IntPtr Prio; public IntPtr Pid; public IntPtr Parent; }
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int c, ref PBI i, int len, out int ret);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int a, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr b, byte[] buf, int n, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetLongPathName(string s, StringBuilder b, int n);
  // 8.3 short names (RUNNER~1) and long names are the same folder; compare long forms.
  public static string Long(string p) {
    try {
      var b = new StringBuilder(1024);
      int n = GetLongPathName(p, b, b.Capacity);
      return n > 0 && n < b.Capacity ? b.ToString() : p;
    } catch { return p; }
  }
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

/**
 * Asks the Windows Restart Manager which processes hold files open. This finds
 * what a working-directory check cannot: language servers, file watchers, git
 * and scanners with a handle on a file somewhere inside the worktree.
 */
const HANDLE_READER = `
public static class PcHandles {
  [StructLayout(LayoutKind.Sequential)] struct FT { public uint Low, High; }
  [StructLayout(LayoutKind.Sequential)] struct UP { public int Pid; public FT Start; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct INFO {
    public UP Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string App;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string Svc;
    public int Type, Status, Session;
    [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint s, int f, System.Text.StringBuilder k);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint s);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmRegisterResources(uint s, uint n, string[] files, uint a, IntPtr apps, uint v, IntPtr svcs);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint s, out uint needed, ref uint count, [In, Out] INFO[] info, out uint reasons);
  public static HashSet<int> Lockers(string[] files) {
    var pids = new HashSet<int>();
    uint s;
    if (RmStartSession(out s, 0, new System.Text.StringBuilder(33)) != 0) return pids;
    try {
      if (RmRegisterResources(s, (uint)files.Length, files, 0, IntPtr.Zero, 0, IntPtr.Zero) != 0) return pids;
      uint needed = 0, count = 0, reasons;
      if (RmGetList(s, out needed, ref count, null, out reasons) != 234 || needed == 0) return pids;
      var info = new INFO[needed]; count = needed;
      if (RmGetList(s, out needed, ref count, info, out reasons) != 0) return pids;
      for (int i = 0; i < count; i++) pids.Add(info[i].Process.Pid);
    } finally { RmEndSession(s); }
    return pids;
  }
}`;

const SCAN_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
${CWD_READER}
${HANDLE_READER}
'@
$root = [PcCwd]::Long([IO.Path]::GetFullPath($env:PC_LOCK_ROOT)).TrimEnd('\\')
$prefix = $root + '\\'
$seen = @{}
function Report($id, $name, $via) {
  if ($script:seen.ContainsKey([int]$id) -or $id -eq $PID) { return }
  $script:seen[[int]$id] = $true
  "$id\`t$name\`t$via"
}
foreach ($p in [Diagnostics.Process]::GetProcesses()) {
  try { $cwd = [PcCwd]::Get($p.Id) } catch { continue }
  if (-not $cwd) { continue }
  $cwd = [PcCwd]::Long($cwd).TrimEnd('\\')
  if ($cwd -eq $root -or $cwd.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    Report $p.Id $p.ProcessName 'cwd'
  }
}
# Open or loaded files (handles, running programs, DLLs), in batches: Restart Manager
# caps the resources per call. Enumerating each process's modules instead takes ~40s.
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object FullName)
for ($i = 0; $i -lt $files.Count; $i += 256) {
  $batch = [string[]]$files[$i..([Math]::Min($i + 255, $files.Count - 1))]
  foreach ($id in [PcHandles]::Lockers($batch)) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p) { Report $id $p.ProcessName 'open file' }
  }
}
# Processes whose working directory cannot be read (started at a higher
# privilege, or by another account) still name the folder in their arguments.
foreach ($c in Get-CimInstance Win32_Process -Property ProcessId,Name,CommandLine) {
  if ($c.ProcessId -eq $PID -or $seen.ContainsKey([int]$c.ProcessId)) { continue }
  if ($c.CommandLine -and $c.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    "$($c.ProcessId)\`t$($c.Name -replace '\\.exe$', '')\`tcommand line"
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

/** Parse the scanner's `pid<TAB>name[<TAB>via]` lines, ignoring anything else it printed. */
export function parseLockerOutput(stdout: string): WorktreeLocker[] {
  const lockers: WorktreeLocker[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(\d+)\t([^\t]+)(?:\t([^\t]+))?$/.exec(line.trim());
    if (match) {
      lockers.push({
        pid: Number(match[1]),
        name: match[2],
        ...(match[3] ? { via: match[3] } : {}),
      });
    }
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
  return lockers
    .map(
      (l) =>
        `${l.name} (pid ${l.pid}${l.via === 'command line' ? ', named in its arguments' : ''})`,
    )
    .join(', ');
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
      ? `Processes holding that folder: ${describeLockers(holders)}. `
      : 'A process (agent, editor, or terminal) may still hold files open inside it. ';
  return new Error(
    `Cannot remove worktree "${worktreePath}": ${detail}. ${who}` +
      'Close anything using that folder, then close the task again to retry.',
  );
}
