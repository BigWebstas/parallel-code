// Structured logger for the main process.
//
// Pairs with src/lib/log.ts (renderer); both modules expose the same
// `debug | info | warn | error` surface so call sites read identically.
// Renderer logs at warn/error (and info when verbose) are forwarded
// here over LogFromRenderer; this module is the merge point.
//
// This is the one place in the codebase where console.{info,debug}
// is intentional — every other module routes through this logger.

/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { IpcMain } from 'electron';
import { IPC } from './ipc/channels.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export type LogFromRendererPayload = {
  level: LogLevel;
  category: string;
  msg: string;
  ctx?: LogContext;
  level_min: LogLevel;
  ts: number;
};

export interface InitFileLoggingOptions {
  /** Target directory or full file path. If directory, 'debug.log' is appended. */
  dirOrPath?: string;
  /** Maximum bytes before rotation. Defaults to 10 MB. */
  maxBytes?: number;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const CTX_MAX_BYTES = 4 * 1024;
const STACK_MAX_LINES = 50;
const RENDERER_MALFORMED_SHAPES = new Set<string>();

const isProd = process.env.NODE_ENV === 'production';

export function isDebugForced(): boolean {
  if (process.env.DEBUG || process.env.PARALLEL_CODE_DEBUG) return true;
  if (process.argv.some((arg) => arg === '--debug' || arg === '--verbose' || arg === '-v')) {
    return true;
  }
  return false;
}

export function checkPersistedVerboseLogging(dir?: string): boolean {
  try {
    if (!dir) return false;
    const stateFile = path.join(dir, 'state.json');
    if (!fs.existsSync(stateFile)) return false;
    const content = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return parsed?.verboseLogging === true;
  } catch {
    return false;
  }
}

export function determineInitialMinLevel(userDataDir?: string): LogLevel {
  const envLevel = process.env.PARALLEL_CODE_LOG_LEVEL?.toLowerCase();
  if (envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error') {
    return envLevel;
  }
  if (isDebugForced()) return 'debug';
  if (userDataDir && checkPersistedVerboseLogging(userDataDir)) return 'debug';
  return isProd ? 'warn' : 'debug';
}

let minLevel: LogLevel = determineInitialMinLevel();

let inLogger = false;
let logFilePath: string | null = null;
let logFileBytes = 0;
let maxLogFileBytes = 10 * 1024 * 1024; // 10 MB

export function setMinLevel(level: LogLevel): void {
  minLevel = level;
}

function rotateLogFile(filePath: string): void {
  try {
    const oldPath = filePath.replace(/\.log$/i, '') + '.old.log';
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // Best effort
      }
    }
    fs.renameSync(filePath, oldPath);
  } catch {
    // If rename fails (e.g. file lock on Windows), truncate the existing file
    try {
      fs.writeFileSync(filePath, '', { flag: 'w' });
    } catch {
      // Best effort
    }
  }
}

export function initFileLogging(target?: string | InitFileLoggingOptions): string | null {
  try {
    let targetPath: string | undefined;
    let maxBytes = 10 * 1024 * 1024;
    if (typeof target === 'string') {
      targetPath = target;
    } else if (target && typeof target === 'object') {
      targetPath = target.dirOrPath;
      if (typeof target.maxBytes === 'number' && target.maxBytes > 0) {
        maxBytes = target.maxBytes;
      }
    }

    maxLogFileBytes = maxBytes;

    const envFile = process.env.PARALLEL_CODE_LOG_FILE;
    const resolvedPath =
      envFile ||
      (targetPath
        ? targetPath.endsWith('.log')
          ? targetPath
          : path.join(targetPath, 'debug.log')
        : null);

    if (!resolvedPath) {
      return null;
    }

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      if (fs.existsSync(resolvedPath)) {
        const stat = fs.statSync(resolvedPath);
        if (stat.size >= maxLogFileBytes) {
          rotateLogFile(resolvedPath);
          logFileBytes = 0;
        } else {
          logFileBytes = stat.size;
        }
      } else {
        logFileBytes = 0;
      }
    } catch {
      logFileBytes = 0;
    }

    logFilePath = resolvedPath;

    if (!process.env.PARALLEL_CODE_LOG_LEVEL && !isDebugForced()) {
      minLevel = determineInitialMinLevel(dir);
    }

    const electronVer = (process.versions as Record<string, string | undefined>).electron ?? 'N/A';
    const banner = [
      '',
      '================================================================================',
      `Parallel Code Debug Log Started: ${new Date().toISOString()}`,
      `Platform: ${process.platform} (${process.arch}) | OS: ${os.release()}`,
      `Node: ${process.versions.node} | Electron: ${electronVer} | PID: ${process.pid}`,
      `CWD: ${process.cwd()}`,
      `Args: ${process.argv.join(' ')}`,
      '================================================================================',
      '',
    ].join('\n');

    fs.appendFileSync(logFilePath, banner, 'utf8');
    logFileBytes += Buffer.byteLength(banner, 'utf8');

    return logFilePath;
  } catch {
    return null;
  }
}

export function getLogFilePath(): string | null {
  return logFilePath;
}

export function closeFileLogging(): void {
  logFilePath = null;
  logFileBytes = 0;
  maxLogFileBytes = 10 * 1024 * 1024;
}

function writeFile(
  now: Date,
  level: LogLevel,
  category: string,
  msg: string,
  ctxStr: string,
  stack: string | null,
): void {
  if (!logFilePath) return;
  try {
    const isoTs = now.toISOString();
    let text = `[${isoTs}] ${level.toUpperCase().padEnd(5)} [${category}] ${msg}${ctxStr}\n`;
    if (stack !== null) {
      text += `${stack}\n`;
    }
    fs.appendFileSync(logFilePath, text, 'utf8');
    logFileBytes += Buffer.byteLength(text, 'utf8');
    if (logFileBytes >= maxLogFileBytes) {
      rotateLogFile(logFilePath);
      logFileBytes = 0;
    }
  } catch {
    // Logger never throws
  }
}

// `console.*` writes to process.stdout/stderr asynchronously; if the parent
// pipe closes mid-shutdown (e.g. `concurrently` SIGTERMs us after vite dies),
// the resulting EPIPE surfaces as an *async* 'error' event the per-call
// try/catch in writeConsole can't catch. Swallow EPIPE here so a routine
// teardown doesn't become an Uncaught Exception. Re-throw anything else.
const swallowEpipe = (err: NodeJS.ErrnoException): void => {
  if (err.code !== 'EPIPE') throw err;
};
process.stdout.on('error', swallowEpipe);
process.stderr.on('error', swallowEpipe);

export function getMinLevel(): LogLevel {
  return minLevel;
}

export function debug(category: string, msg: string, ctx?: LogContext): void {
  emit('debug', category, msg, ctx);
}

export function info(category: string, msg: string, ctx?: LogContext): void {
  emit('info', category, msg, ctx);
}

export function warn(category: string, msg: string, ctx?: LogContext): void {
  emit('warn', category, msg, ctx);
}

export function error(category: string, msg: string, err: unknown, ctx?: LogContext): void {
  emit('error', category, msg, ctx, err);
}

/** Reduce an unknown thrown value to a human-readable string. */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function emit(
  level: LogLevel,
  category: string,
  msg: string,
  ctx: LogContext | undefined,
  err?: unknown,
): void {
  if (inLogger) return;
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  inLogger = true;
  try {
    const now = new Date();
    const ts = formatTimestamp(now.getTime());
    const ctxStr = serialiseCtx(ctx);
    const head = `[${ts}] ${level.toUpperCase()} ${category} — ${msg}${ctxStr}`;
    writeConsole(level, head);
    const stack = level === 'error' ? stackFrom(err) : null;
    if (stack !== null) {
      writeConsole(level, stack);
    }
    if (logFilePath) {
      writeFile(now, level, category, msg, ctxStr, stack);
    }
  } catch {
    // Logger never throws into the caller.
  } finally {
    inLogger = false;
  }
}

function writeConsole(level: LogLevel, line: string): void {
  try {
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else if (level === 'info') console.info(line);
    else console.debug(line);
  } catch {
    // ignore — logger never throws
  }
}

function formatTimestamp(epochMs: number): string {
  try {
    const d = new Date(epochMs);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return '00:00:00.000';
  }
}

function serialiseCtx(ctx: LogContext | undefined): string {
  if (ctx === undefined) return '';
  let body: string;
  try {
    body = JSON.stringify(ctx, replacerWithCircular());
  } catch {
    try {
      const safe: Record<string, unknown> = {};
      for (const k of Object.keys(ctx)) {
        try {
          JSON.stringify(ctx[k], replacerWithCircular());
          safe[k] = ctx[k];
        } catch {
          safe[k] = '[unserialisable]';
        }
      }
      body = JSON.stringify(safe);
    } catch {
      return '';
    }
  }
  if (body.length > CTX_MAX_BYTES) body = body.slice(0, CTX_MAX_BYTES) + '…';
  return ' ' + body;
}

function replacerWithCircular(): (k: string, v: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
      // `Node` is a DOM global, undefined in the main process. Guard the
      // instanceof check so it doesn't ReferenceError on every plain object.
      // (The renderer-side logger has the same guard.)
      const hasNodeType = (v as { nodeType?: unknown }).nodeType;
      if (typeof hasNodeType === 'number') {
        return '[node]';
      }
    }
    if (typeof v === 'function') return '[function]';
    return v;
  };
}

function stackFrom(err: unknown): string | null {
  if (err === undefined) return null;
  if (err instanceof Error && typeof err.stack === 'string') return clipStack(err.stack);
  if (err && typeof err === 'object' && typeof (err as { stack?: unknown }).stack === 'string') {
    return clipStack((err as { stack: string }).stack);
  }
  if (err === null) return 'null';
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function clipStack(stack: string): string {
  const lines = stack.split('\n');
  if (lines.length <= STACK_MAX_LINES) return stack;
  return lines.slice(0, STACK_MAX_LINES).join('\n') + '\n…';
}

const VALID_LEVELS: ReadonlySet<string> = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);

const CATEGORY_MAX_LEN = 256;
const MSG_MAX_LEN = 4096;
const CTX_MAX_BYTES_INPUT = 16 * 1024;

export function isValidPayload(value: unknown): value is LogFromRendererPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!VALID_LEVELS.has(v.level as string)) return false;
  if (!VALID_LEVELS.has(v.level_min as string)) return false;
  if (typeof v.category !== 'string' || v.category.length > CATEGORY_MAX_LEN) return false;
  if (typeof v.msg !== 'string' || v.msg.length > MSG_MAX_LEN) return false;
  if (typeof v.ts !== 'number') return false;
  if (v.ctx !== undefined) {
    if (typeof v.ctx !== 'object' || v.ctx === null || Array.isArray(v.ctx)) return false;
    // Bound input ctx size so a renderer cannot OOM main with a huge
    // object. Use a circular-safe stringify so a circular reference
    // doesn't bypass the bound by throwing.
    let size = 0;
    try {
      size = JSON.stringify(v.ctx, ctxSizeReplacer()).length;
    } catch {
      // Stringify still failed — reject rather than silently accept.
      return false;
    }
    if (size > CTX_MAX_BYTES_INPUT) return false;
  }
  return true;
}

function ctxSizeReplacer(): (k: string, v: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
    }
    if (typeof v === 'function') return '[function]';
    return v;
  };
}

function payloadShape(value: unknown): string {
  if (!value || typeof value !== 'object') return typeof value;
  const v = value as Record<string, unknown>;
  return [
    `level=${typeof v.level}`,
    `category=${typeof v.category}`,
    `msg=${typeof v.msg}`,
    `ctx=${v.ctx === undefined ? 'undefined' : typeof v.ctx}`,
    `level_min=${typeof v.level_min}`,
    `ts=${typeof v.ts}`,
  ].join(',');
}

/**
 * Wire the LogFromRenderer IPC handler. Call once at app startup.
 */
export function registerLogHandler(ipc: IpcMain): void {
  ipc.handle(IPC.LogFromRenderer, (_e, raw) => {
    if (!isValidPayload(raw)) {
      const shape = payloadShape(raw);
      if (!RENDERER_MALFORMED_SHAPES.has(shape)) {
        RENDERER_MALFORMED_SHAPES.add(shape);
        warn('log.ipc', 'malformed LogFromRenderer payload dropped', { shape });
      }
      return;
    }
    // Reconcile main's level from the renderer's reported minimum when debug
    // is not forced so a verbose-toggle change in the renderer converges in
    // one round-trip.
    if (!isDebugForced()) {
      const prevLevel = minLevel;
      if (prevLevel !== raw.level_min) {
        minLevel = raw.level_min;
        emit('warn', 'log', `Log level changed from ${prevLevel} to ${minLevel}`, {
          logFilePath,
          verbose: minLevel === 'debug',
        });
      }
    }
    // Forward the entry through main's normal pipeline.
    if (raw.category !== 'log' || !raw.msg.startsWith('sync log level')) {
      emit(raw.level, `r.${raw.category}`, raw.msg, raw.ctx);
    }
  });
}
