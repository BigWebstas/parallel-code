import { describe, expect, it } from 'vitest';
import { isPlanApprovalEvent } from './canvas-auto-open';

describe('isPlanApprovalEvent', () => {
  it('is the pre-hook of ExitPlanMode, however the vendor spells it', () => {
    expect(isPlanApprovalEvent({ event: 'PreToolUse', toolName: 'ExitPlanMode' })).toBe(true);
    expect(isPlanApprovalEvent({ event: 'PreToolUse', toolName: 'exit_plan_mode' })).toBe(true);
    expect(isPlanApprovalEvent({ event: 'PostToolUse', toolName: 'ExitPlanMode' })).toBe(false);
    expect(isPlanApprovalEvent({ event: 'PreToolUse', toolName: 'Write' })).toBe(false);
  });
});
