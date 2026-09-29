import { describe, expect, it } from 'vitest';
import { commandName } from './command-name.js';

describe('commandName', () => {
  it.each([
    ['claude', 'claude'],
    ['/usr/local/bin/claude', 'claude'],
    [String.raw`C:\Users\me\.local\bin\claude.exe`, 'claude'],
    ['C:/tools/codex.CMD', 'codex'],
    ['/opt/agy/', 'agy'],
  ])('maps %s to %s', (command, expected) => {
    expect(commandName(command)).toBe(expected);
  });
});
