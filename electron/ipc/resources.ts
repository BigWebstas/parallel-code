import { app } from 'electron';
import os from 'os';
import {
  createCpuSampler,
  groupProcesses,
  readProcessTable,
  type ProcRow,
} from './process-stats.js';
import { debug as logDebug } from '../log.js';
import { getPtyProcessRoots } from './pty.js';
import { readWindowsProcessTable } from './windows-process-table.js';
import type { ResourceSnapshot } from './shared-types.js';

// CPU deltas over a few milliseconds are tick-quantisation noise, so callers
// closer together than this (several windows, overlapping polls) share a sample.
const MIN_SAMPLE_GAP_MS = 500;

const sampleCpu = createCpuSampler();
let inFlight: Promise<ResourceSnapshot> | null = null;
let last: ResourceSnapshot | null = null;

/**
 * Fallback when the Windows process table cannot be read: Electron still reports
 * CPU and memory for the app's own processes, so the footer shows those alone
 * (no agent or subprocess trees) rather than nothing.
 */
function appMetricRows(metrics: Electron.ProcessMetric[]): ProcRow[] {
  return metrics.map((metric) => ({
    pid: metric.pid,
    ppid: metric.pid === process.pid ? 0 : process.pid,
    name: metric.name ?? metric.type,
    memoryBytes: metric.memory.workingSetSize * 1024,
    cpuPercent: metric.cpu.percentCPUUsage,
  }));
}

async function takeSnapshot(): Promise<ResourceSnapshot> {
  const sampledAt = Date.now();
  const metrics = app.getAppMetrics();
  const rows =
    process.platform === 'win32'
      ? await readWindowsProcessTable().catch((err: unknown) => {
          logDebug('resources', 'process table unavailable, using app metrics only', {
            err: err instanceof Error ? err.message : String(err),
          });
          return appMetricRows(metrics);
        })
      : await readProcessTable();
  const appProcesses = new Map(
    metrics.map((metric) => [metric.pid, metric.name ?? metric.type] as const),
  );
  return {
    groups: groupProcesses({
      rows,
      cpu: sampleCpu(rows, sampledAt),
      ptys: getPtyProcessRoots(),
      appProcesses,
      mainPid: process.pid,
    }),
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    sampledAt,
  };
}

/** CPU and memory of every agent/shell PTY tree, the app itself, and its other subprocesses. */
export function getResourceSnapshot(): Promise<ResourceSnapshot> {
  if (last && Date.now() - last.sampledAt < MIN_SAMPLE_GAP_MS) return Promise.resolve(last);
  inFlight ??= takeSnapshot()
    .then((snapshot) => (last = snapshot))
    .finally(() => (inFlight = null));
  return inFlight;
}
