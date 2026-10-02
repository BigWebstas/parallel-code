import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { symlinkCrossPlatform, unlinkSymlinkCrossPlatform } from './symlink.js';

describe('symlinkCrossPlatform', () => {
  const realSymlink = fs.symlinkSync;
  const calls: { source: string; target: string; type?: string }[] = [];
  let statResult: 'dir' | 'file' | 'missing' = 'dir';

  const realPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    vi.restoreAllMocks();
    calls.length = 0;
    statResult = 'dir';
  });

  function mockFs(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform });
    vi.spyOn(fs, 'statSync').mockImplementation((() => {
      if (statResult === 'missing') throw new Error('ENOENT');
      return { isDirectory: () => statResult === 'dir' };
    }) as unknown as typeof fs.statSync);
    vi.spyOn(fs, 'symlinkSync').mockImplementation(((
      source: string,
      target: string,
      type?: string,
    ) => {
      calls.push({ source, target, type });
      if (platform === 'win32' && type === 'dir') throw new Error('EPERM');
    }) as unknown as typeof fs.symlinkSync);
  }

  it('passes through to plain symlinkSync off Windows', () => {
    mockFs('linux');
    symlinkCrossPlatform('../src', '/wt/pkg');
    expect(calls).toEqual([{ source: '../src', target: '/wt/pkg', type: undefined }]);
  });

  it('uses a plain file link for non-directories on Windows', () => {
    mockFs('win32');
    statResult = 'file';
    symlinkCrossPlatform('C:\\repo\\file.txt', 'C:\\wt\\file.txt');
    expect(calls).toEqual([
      { source: 'C:\\repo\\file.txt', target: 'C:\\wt\\file.txt', type: undefined },
    ]);
  });

  it('falls back from dir symlink to an absolute junction on Windows', () => {
    mockFs('win32');
    symlinkCrossPlatform('..\\src', 'C:\\wt\\pkg');
    expect(calls).toEqual([
      { source: '..\\src', target: 'C:\\wt\\pkg', type: 'dir' },
      // Junctions require absolute targets, so the relative link is resolved.
      { source: path.win32.resolve('C:\\wt', '..\\src'), target: 'C:\\wt\\pkg', type: 'junction' },
    ]);
  });

  it('writes real links on disk', () => {
    vi.restoreAllMocks();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-symlink-'));
    try {
      const srcDir = path.join(dir, 'src');
      fs.mkdirSync(srcDir);
      const linkDir = path.join(dir, 'linked');
      symlinkCrossPlatform(srcDir, linkDir);
      expect(fs.statSync(linkDir).isDirectory()).toBe(true);

      const srcFile = path.join(dir, 'a.txt');
      fs.writeFileSync(srcFile, 'x');
      const linkFile = path.join(dir, 'b.txt');
      symlinkCrossPlatform(srcFile, linkFile);
      expect(fs.readFileSync(linkFile, 'utf8')).toBe('x');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(realSymlink).toBe(fs.symlinkSync);
  });
});

describe('unlinkSymlinkCrossPlatform', () => {
  const realPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    vi.restoreAllMocks();
  });

  it('unlinks via unlinkSync on POSIX', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    unlinkSymlinkCrossPlatform('/tmp/test-link');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/test-link');
  });

  it('falls back to rmdirSync on Windows if unlinkSync fails', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: operation not permitted');
    });
    const rmdirSpy = vi.spyOn(fs, 'rmdirSync').mockImplementation(() => {});
    unlinkSymlinkCrossPlatform('C:\\test\\junction');
    expect(rmdirSpy).toHaveBeenCalledWith('C:\\test\\junction');
  });

  it('re-throws original error if rmdirSync also fails on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const origError = new Error('EPERM: operation not permitted');
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw origError;
    });
    vi.spyOn(fs, 'rmdirSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    expect(() => unlinkSymlinkCrossPlatform('C:\\test\\junction')).toThrow(origError);
  });
});
