import { createMemo, createSignal, onCleanup } from 'solid-js';
import { isWindowVisible } from './windowVisibility';

// A CSS animation keeps the renderer producing a frame — style recalc and
// repaint — on every vsync for as long as it runs, even when stepped. One slow
// timer that turns only the visible spinners costs a few small updates a second.
const TICK_MS = 75;

const [tick, setTick] = createSignal(0);
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function acquire(): void {
  if (users++ > 0) return;
  timer = setInterval(() => {
    if (isWindowVisible()) setTick((t) => t + 1);
  }, TICK_MS);
}

function release(): void {
  if (--users > 0 || timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
}

/**
 * Rotation in degrees for a spinner that completes a turn every `ticks` ticks
 * (75 ms each). The timer runs only while at least one caller's owner is alive.
 */
export function createSpinnerAngle(ticks: number): () => number {
  acquire();
  onCleanup(release);
  const angle = createMemo(() => ((tick() % ticks) / ticks) * 360);
  return angle;
}
