import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readCmdShimTarget,
  resolveWindowsLaunch,
  resolveWindowsProgram,
} from './windows-launch.js';

// The shim npm's cmd-shim writes for a JavaScript entry.
const JS_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  ')',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*',
].join('\r\n');

// The shim for a package whose bin is a native executable.
const EXE_SHIM = [
  '@ECHO off',
  'SETLOCAL',
  'CALL :find_dp0',
  '"%dp0%\\node_modules\\@openai\\codex\\bin\\codex.exe"   %*',
].join('\r\n');

let dir: string;
let jsShim: string;
let exeShim: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-launch-'));
  jsShim = path.join(dir, 'claude.cmd');
  exeShim = path.join(dir, 'codex.cmd');
  fs.writeFileSync(jsShim, JS_SHIM);
  fs.writeFileSync(exeShim, EXE_SHIM);
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('readCmdShimTarget', () => {
  it('finds the JavaScript entry, not the bundled node.exe', () => {
    expect(readCmdShimTarget(jsShim)).toBe(
      path.win32.join(dir, 'node_modules\\@anthropic-ai\\claude-code\\cli.js'),
    );
  });

  it('finds a native executable target', () => {
    expect(readCmdShimTarget(exeShim)).toBe(
      path.win32.join(dir, 'node_modules\\@openai\\codex\\bin\\codex.exe'),
    );
  });

  it('returns undefined for an unreadable shim', () => {
    expect(readCmdShimTarget(path.join(dir, 'missing.cmd'))).toBeUndefined();
  });
});

describe('resolveWindowsLaunch', () => {
  it('is a no-op off Windows', () => {
    expect(resolveWindowsLaunch('claude', ['-p', 'hi'], {}, 'linux')).toEqual({
      file: 'claude',
      args: ['-p', 'hi'],
    });
  });

  it('runs a JavaScript shim target with node, keeping prompt text as one argument', () => {
    const prompt = 'line one\nline two with % and ^ and "quotes"';
    const launch = resolveWindowsLaunch(jsShim, ['-p', prompt], {}, 'win32');
    expect(launch.file).toBe('node');
    expect(launch.args).toEqual([
      path.win32.join(dir, 'node_modules\\@anthropic-ai\\claude-code\\cli.js'),
      '-p',
      prompt,
    ]);
  });

  it('launches a native shim target directly', () => {
    expect(resolveWindowsLaunch(exeShim, ['exec'], {}, 'win32')).toEqual({
      file: path.win32.join(dir, 'node_modules\\@openai\\codex\\bin\\codex.exe'),
      args: ['exec'],
    });
  });

  it('keeps an explicit executable path', () => {
    expect(resolveWindowsProgram('C:\\tools\\claude.exe', {}, 'win32')).toBe(
      'C:\\tools\\claude.exe',
    );
  });
});
