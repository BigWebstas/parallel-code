import { describe, expect, it } from 'vitest';
import { defenderExclusionCommand } from './defender-exclusion';

describe('defenderExclusionCommand', () => {
  it('lists each folder once, single-quoted', () => {
    expect(defenderExclusionCommand(['C:\\Git\\app', 'D:\\work', 'C:\\Git\\app', ''])).toBe(
      "Add-MpPreference -ExclusionPath 'C:\\Git\\app', 'D:\\work'",
    );
  });

  it('keeps quotes, dollar signs and backticks literal', () => {
    expect(defenderExclusionCommand(["C:\\Bob's $repo `x"])).toBe(
      "Add-MpPreference -ExclusionPath 'C:\\Bob''s $repo `x'",
    );
  });
});
