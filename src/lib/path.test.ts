import { describe, expect, it } from 'vitest';
import { abbreviateHomePath, pathBasename } from './path';

describe('abbreviateHomePath', () => {
  it('shortens macOS home paths', () => {
    expect(abbreviateHomePath('/Users/liang/projects/app')).toBe('~/projects/app');
  });

  it('shortens Linux home paths', () => {
    expect(abbreviateHomePath('/home/liang/projects/app')).toBe('~/projects/app');
  });

  it('shortens the home directory itself', () => {
    expect(abbreviateHomePath('/Users/liang')).toBe('~');
  });

  it('leaves non-home paths unchanged', () => {
    expect(abbreviateHomePath('/var/tmp/app')).toBe('/var/tmp/app');
  });

  it('shortens Windows user-profile paths, keeping backslashes', () => {
    expect(abbreviateHomePath('C:\\Users\\liang\\projects\\app')).toBe('~\\projects\\app');
    expect(abbreviateHomePath('C:/Users/liang/projects/app')).toBe('~/projects/app');
    expect(abbreviateHomePath('C:\\Users\\liang')).toBe('~');
    expect(abbreviateHomePath('D:\\work\\app')).toBe('D:\\work\\app');
  });
});

describe('pathBasename', () => {
  it('handles POSIX and Windows separators', () => {
    expect(pathBasename('/home/me/app')).toBe('app');
    expect(pathBasename('C:\\Git\\parallel-code')).toBe('parallel-code');
    expect(pathBasename('C:/Git/parallel-code/')).toBe('parallel-code');
  });
});
