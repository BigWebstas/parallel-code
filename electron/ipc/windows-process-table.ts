import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { debug as logDebug, warn as logWarn } from '../log.js';
import type { ProcRow } from './process-stats.js';

// Windows has no `ps` and no /proc. Launching PowerShell for every sample would
// cost a process creation (~0.5 s with endpoint security) each time the footer
// polls, so one helper stays alive and answers a line on stdin with one process
// table. It is stopped when nobody has asked for a while.

const END_MARKER = '<<END>>';
const REQUEST_TIMEOUT_MS = 15_000;
const IDLE_STOP_MS = 30_000;

const HELPER_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($null -ne [Console]::In.ReadLine()) {
  Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,WorkingSetSize,KernelModeTime,UserModeTime,CreationDate | ForEach-Object {
    $created = if ($_.CreationDate) { [long]($_.CreationDate.ToFileTimeUtc() / 10000) } else { 0 }
    [Console]::Out.WriteLine(($_.ProcessId, $_.ParentProcessId, $_.WorkingSetSize, ([long]$_.KernelModeTime + [long]$_.UserModeTime), $created, $_.Name -join "\`t"))
  }
  [Console]::Out.WriteLine('${END_MARKER}')
}`;

/**
 * Parse the helper's tab-separated lines:
 * `pid ppid workingSetBytes cpuTime100ns createdMs name`.
 */
export function parseWindowsProcessTable(text: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [pid, ppid, memory, cpuTime, created, ...name] = line.split('\t');
    const row = {
      pid: Number(pid),
      ppid: Number(ppid),
      memoryBytes: Number(memory),
      cpuSeconds: Number(cpuTime) / 1e7,
      startTicks: Number(created),
    };
    if (name.length === 0 || !Object.values(row).every(Number.isFinite)) continue;
    rows.push({ ...row, name: name.join('\t').replace(/\.exe$/i, '') });
  }
  return rows;
}

interface Helper {
  child: ChildProcessWithoutNullStreams;
  /** Settles the request in flight with the text read so far. */
  pending: ((result: string | Error) => void) | null;
}

let helper: Helper | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function stopHelper(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const current = helper;
  helper = null;
  if (!current) return;
  current.pending?.(new Error('process table helper stopped'));
  current.child.kill();
}

function startHelper(): Helper {
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64'),
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const current: Helper = { child, pending: null };
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const end = buffer.indexOf(END_MARKER);
    if (end < 0) return;
    const table = buffer.slice(0, end);
    buffer = buffer.slice(end + END_MARKER.length);
    const settle = current.pending;
    current.pending = null;
    settle?.(table);
  });
  child.stderr.resume();
  child.on('error', (err) => {
    logWarn('resources', 'process table helper failed to start', { err: err.message });
    if (helper === current) helper = null;
    current.pending?.(err);
  });
  child.on('exit', () => {
    if (helper === current) helper = null;
    current.pending?.(new Error('process table helper exited'));
  });
  logDebug('resources', 'process table helper started', { pid: child.pid });
  return current;
}

/** The whole Windows process table, from a helper that is started on first use. */
export function readWindowsProcessTable(): Promise<ProcRow[]> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(stopHelper, IDLE_STOP_MS);
  idleTimer.unref();

  const current = (helper ??= startHelper());
  if (current.pending) return Promise.reject(new Error('process table read already in flight'));
  return new Promise<ProcRow[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopHelper();
      reject(new Error('process table read timed out'));
    }, REQUEST_TIMEOUT_MS);
    current.pending = (result) => {
      clearTimeout(timeout);
      if (result instanceof Error) reject(result);
      else resolve(parseWindowsProcessTable(result));
    };
    current.child.stdin.write('\n', (err) => {
      if (err) current.pending?.(err);
    });
  });
}
