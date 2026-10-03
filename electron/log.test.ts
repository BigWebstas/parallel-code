import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  isValidPayload,
  initFileLogging,
  getLogFilePath,
  closeFileLogging,
  setMinLevel,
  isDebugForced,
  checkPersistedVerboseLogging,
  determineInitialMinLevel,
  debug,
  info,
  warn,
  error,
} from './log.js';

describe('main logger — payload validation', () => {
  const base = {
    level: 'warn' as const,
    category: 'cat',
    msg: 'msg',
    level_min: 'warn' as const,
    ts: 0,
  };

  it('accepts a well-shaped payload', () => {
    expect(isValidPayload(base)).toBe(true);
    expect(isValidPayload({ ...base, ctx: { taskId: 't1' } })).toBe(true);
  });

  it('rejects unknown level', () => {
    expect(isValidPayload({ ...base, level: 'trace' })).toBe(false);
  });

  it('rejects non-string category', () => {
    expect(isValidPayload({ ...base, category: 123 })).toBe(false);
  });

  it('rejects non-string msg', () => {
    expect(isValidPayload({ ...base, msg: { x: 1 } })).toBe(false);
  });

  it('rejects unknown level_min', () => {
    expect(isValidPayload({ ...base, level_min: 'verbose' })).toBe(false);
  });

  it('rejects non-number ts', () => {
    expect(isValidPayload({ ...base, ts: '0' })).toBe(false);
  });

  it('rejects ctx that is not an object', () => {
    expect(isValidPayload({ ...base, ctx: 'string' })).toBe(false);
    expect(isValidPayload({ ...base, ctx: null })).toBe(false);
  });

  it('rejects null and non-object payloads', () => {
    expect(isValidPayload(null)).toBe(false);
    expect(isValidPayload(undefined)).toBe(false);
    expect(isValidPayload('payload')).toBe(false);
  });

  it('rejects arrays as ctx', () => {
    expect(isValidPayload({ ...base, ctx: [1, 2, 3] })).toBe(false);
  });

  it('rejects oversized category and msg', () => {
    expect(isValidPayload({ ...base, category: 'x'.repeat(257) })).toBe(false);
    expect(isValidPayload({ ...base, msg: 'x'.repeat(4097) })).toBe(false);
  });

  it('rejects ctx whose serialised size exceeds the bound', () => {
    const big = { s: 'x'.repeat(20_000) };
    expect(isValidPayload({ ...base, ctx: big })).toBe(false);
  });

  it('accepts a normally-sized ctx', () => {
    expect(isValidPayload({ ...base, ctx: { taskId: 't1', err: 'short' } })).toBe(true);
  });

  it('rejects oversized circular ctx (size cap is not bypassable via cycles)', () => {
    const big: Record<string, unknown> = { s: 'x'.repeat(20_000) };
    big.self = big;
    expect(isValidPayload({ ...base, ctx: big })).toBe(false);
  });

  it('accepts a small circular ctx', () => {
    const small: Record<string, unknown> = { name: 'small' };
    small.self = small;
    expect(isValidPayload({ ...base, ctx: small })).toBe(true);
  });
});

describe('main logger — file logging and level gating', () => {
  let tmpDir: string;
  let spies: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-log-test-'));
    spies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
    };
  });

  afterEach(() => {
    spies.debug.mockRestore();
    spies.info.mockRestore();
    spies.warn.mockRestore();
    spies.error.mockRestore();
    closeFileLogging();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('initFileLogging initializes log file and writes startup banner', () => {
    const logPath = initFileLogging(tmpDir);
    expect(logPath).toBe(path.join(tmpDir, 'debug.log'));
    expect(getLogFilePath()).toBe(logPath);
    if (!logPath) throw new Error('Expected logPath to be defined');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf8');
    expect(content).toContain('Parallel Code Debug Log Started');
    expect(content).toContain(`Platform: ${process.platform}`);
  });

  it('writes debug, info, warn, and error entries to the log file', () => {
    const logPath = initFileLogging(tmpDir);
    setMinLevel('debug');

    debug('test-cat', 'debug test message', { id: 123 });
    info('test-cat', 'info test message');
    warn('test-cat', 'warn test message');
    error('test-cat', 'error test message', new Error('test-err-stack'));

    if (!logPath) throw new Error('Expected logPath to be defined');
    const content = fs.readFileSync(logPath, 'utf8');
    expect(content).toContain('DEBUG [test-cat] debug test message {"id":123}');
    expect(content).toContain('INFO  [test-cat] info test message');
    expect(content).toContain('WARN  [test-cat] warn test message');
    expect(content).toContain('ERROR [test-cat] error test message');
    expect(content).toContain('test-err-stack');
  });

  it('rotates log file when size exceeds maxBytes', () => {
    const logPath = initFileLogging({ dirOrPath: tmpDir, maxBytes: 400 });
    setMinLevel('debug');

    for (let i = 0; i < 20; i++) {
      info('rotation', `message number ${i} with padding text to exceed max bytes`);
    }

    const oldLogPath = path.join(tmpDir, 'debug.old.log');
    expect(fs.existsSync(oldLogPath)).toBe(true);
    if (!logPath) throw new Error('Expected logPath to be defined');
    expect(fs.existsSync(logPath)).toBe(true);
  });

  it('suppresses debug and info entries from the log file when minLevel is warn', () => {
    const logPath = initFileLogging(tmpDir);
    setMinLevel('warn');

    debug('test-cat', 'hidden debug message');
    info('test-cat', 'hidden info message');
    warn('test-cat', 'visible warn message');
    error('test-cat', 'visible error message', new Error('visible-error'));

    if (!logPath) throw new Error('Expected logPath to be defined');
    const content = fs.readFileSync(logPath, 'utf8');
    expect(content).not.toContain('hidden debug message');
    expect(content).not.toContain('hidden info message');
    expect(content).toContain('WARN  [test-cat] visible warn message');
    expect(content).toContain('ERROR [test-cat] visible error message');
  });

  it('checkPersistedVerboseLogging inspects state.json in the target directory', () => {
    expect(checkPersistedVerboseLogging(tmpDir)).toBe(false);
    expect(checkPersistedVerboseLogging(undefined)).toBe(false);

    fs.writeFileSync(
      path.join(tmpDir, 'state.json'),
      JSON.stringify({ verboseLogging: true }),
      'utf8',
    );
    expect(checkPersistedVerboseLogging(tmpDir)).toBe(true);

    fs.writeFileSync(
      path.join(tmpDir, 'state.json'),
      JSON.stringify({ verboseLogging: false }),
      'utf8',
    );
    expect(checkPersistedVerboseLogging(tmpDir)).toBe(false);

    fs.writeFileSync(path.join(tmpDir, 'state.json'), 'invalid json', 'utf8');
    expect(checkPersistedVerboseLogging(tmpDir)).toBe(false);
  });

  it('determineInitialMinLevel returns debug when state.json has verboseLogging: true', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'state.json'),
      JSON.stringify({ verboseLogging: true }),
      'utf8',
    );
    expect(determineInitialMinLevel(tmpDir)).toBe('debug');
  });

  it('isDebugForced checks CLI args and env vars', () => {
    const origDebug = process.env.DEBUG;
    try {
      delete process.env.DEBUG;
      delete process.env.PARALLEL_CODE_DEBUG;
      expect(isDebugForced()).toBe(false);

      process.env.DEBUG = '1';
      expect(isDebugForced()).toBe(true);
    } finally {
      if (origDebug !== undefined) {
        process.env.DEBUG = origDebug;
      } else {
        delete process.env.DEBUG;
      }
    }
  });
});
