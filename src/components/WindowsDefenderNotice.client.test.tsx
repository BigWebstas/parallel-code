import { render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { state, setState, dismiss } = vi.hoisted(() => {
  // Filled in beforeAll; hoisting runs before solid-js is importable here.
  return {
    state: {} as {
      projects: { path: string }[];
      defenderNoticeDismissed: boolean;
      keybindingMigrationDismissed: boolean;
    },
    setState: { current: (() => {}) as (key: string, value: unknown) => void },
    dismiss: vi.fn(),
  };
});

vi.mock('../store/store', () => ({
  get store() {
    return state;
  },
}));
vi.mock('../store/defender-notice', () => ({ dismissDefenderNotice: dismiss }));

let WindowsDefenderNotice: () => unknown;
const disposers: Array<() => void> = [];

beforeAll(async () => {
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    configurable: true,
  });
  const [store, set] = createStore({
    projects: [{ path: 'C:\\Git\\app' }],
    defenderNoticeDismissed: false,
    keybindingMigrationDismissed: true,
  });
  Object.defineProperties(state, {
    projects: { get: () => store.projects },
    defenderNoticeDismissed: { get: () => store.defenderNoticeDismissed },
    keybindingMigrationDismissed: { get: () => store.keybindingMigrationDismissed },
  });
  setState.current = (key, value) => set(key as never, value as never);
  ({ WindowsDefenderNotice } = await import('./WindowsDefenderNotice'));
});

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.innerHTML = '';
  dismiss.mockReset();
});

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  disposers.push(render(() => WindowsDefenderNotice() as never, container));
  return container;
}

describe('WindowsDefenderNotice', () => {
  it('shows the exclusion command for the project folders and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const container = mount();
    expect(container.querySelector('pre')?.textContent).toBe(
      "Add-MpPreference -ExclusionPath 'C:\\Git\\app'",
    );
    const copy = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Copy command',
    );
    copy?.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("Add-MpPreference -ExclusionPath 'C:\\Git\\app'");
  });

  it('dismisses from the close button', () => {
    const container = mount();
    container
      .querySelector<HTMLButtonElement>('[aria-label="Dismiss the Windows Defender tip"]')
      ?.click();
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('waits for the keyboard shortcuts notice to go away', () => {
    setState.current('keybindingMigrationDismissed', false);
    const container = mount();
    expect(container.querySelector('[role="region"]')).toBeNull();
    setState.current('keybindingMigrationDismissed', true);
  });
});
