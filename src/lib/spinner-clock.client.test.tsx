import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSpinnerAngle } from './spinner-clock';

describe('createSpinnerAngle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns through a full revolution in the requested number of ticks', () => {
    createRoot((dispose) => {
      const angle = createSpinnerAngle(4);
      expect(angle()).toBe(0);
      vi.advanceTimersByTime(75);
      expect(angle()).toBe(90);
      vi.advanceTimersByTime(75 * 3);
      expect(angle()).toBe(0);
      dispose();
    });
  });

  it('runs one timer for all spinners and stops it when the last one goes', () => {
    expect(vi.getTimerCount()).toBe(0);
    let disposeA = () => {};
    let disposeB = () => {};
    createRoot((dispose) => {
      disposeA = dispose;
      createSpinnerAngle(8);
    });
    createRoot((dispose) => {
      disposeB = dispose;
      createSpinnerAngle(12);
    });
    expect(vi.getTimerCount()).toBe(1);
    disposeA();
    expect(vi.getTimerCount()).toBe(1);
    disposeB();
    expect(vi.getTimerCount()).toBe(0);
  });
});
