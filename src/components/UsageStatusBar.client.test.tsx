import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreditUsage } from '../ipc/types';
import type { UsageState } from '../store/types';
import { UsageStatusBar } from './UsageStatusBar';

const { mockRefreshUsage, usage } = vi.hoisted(() => {
  const idle: UsageState = {
    fiveHour: null,
    sevenDay: null,
    fetchedAt: null,
    status: 'idle',
    error: null,
  };
  const inAnHour = Date.now() + 3_600_000;
  return {
    mockRefreshUsage: vi.fn(),
    usage: {
      claude: {
        fiveHour: { usedPercent: 40, resetsAt: inAnHour },
        sevenDay: { usedPercent: 10, resetsAt: inAnHour },
        creditUsage: {
          used: 2.12,
          limit: 30,
          currency: 'USD',
          usedPercent: 7.07,
        } as CreditUsage | null,
        fetchedAt: Date.now(),
        status: 'ok',
        error: null,
      } satisfies UsageState,
      codex: idle,
      antigravity: idle,
    },
  };
});

vi.mock('../store/store', () => ({
  store: { usage },
  refreshUsage: mockRefreshUsage,
  USAGE_PROVIDERS: ['claude', 'codex', 'antigravity'],
}));

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.replaceChildren();
  mockRefreshUsage.mockClear();
});

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  disposers.push(render(() => <UsageStatusBar />, container));
  return container;
}

const popover = () => document.querySelector<HTMLElement>('[data-testid="usage-popover"]');

describe('UsageStatusBar', () => {
  it('shows only the five-hour window inline, per logged-in provider', () => {
    const container = mount();
    const entries = container.querySelectorAll('[role="status"]');
    expect(entries).toHaveLength(1);
    expect(entries[0].textContent).toContain('Claude');
    expect(entries[0].textContent).toContain('60% left');
    expect(entries[0].textContent).not.toContain('7d');
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
  });

  it('fills the meter with what is left, not what is used', () => {
    const container = mount();
    const meter = container.querySelector<HTMLElement>('[role="progressbar"]');
    expect(meter?.getAttribute('aria-valuenow')).toBe('60');
    expect(meter?.firstElementChild).toHaveProperty('style.width', '60%');
  });

  it('opens a popover with both windows and the refresh time on hover', () => {
    const container = mount();
    const entry = container.querySelector<HTMLElement>('[role="status"]');
    if (!entry) throw new Error('no provider entry');
    expect(popover()).toBeNull();

    entry.dispatchEvent(new MouseEvent('mouseenter'));
    const card = popover();
    expect(card?.textContent).toContain('5h');
    expect(card?.textContent).toContain('7d');
    expect(card?.textContent).toContain('90% left');
    expect(card?.textContent).toContain('Credits');
    expect(card?.textContent).toContain('$2.12 / $30.00');
    expect(card?.textContent).toContain('(7%)');
    expect(card?.textContent).toContain('Updated');
    expect(card?.style.pointerEvents).toBe('none');

    entry.dispatchEvent(new MouseEvent('mouseleave'));
    expect(popover()).toBeNull();
  });

  it('refreshes just the clicked provider', () => {
    const container = mount();
    container.querySelector<HTMLElement>('[role="status"]')?.click();
    expect(mockRefreshUsage).toHaveBeenCalledWith('claude', { force: true });
  });

  it('renders Antigravity usage when a snapshot is present', () => {
    usage.antigravity = {
      fiveHour: { usedPercent: 15, resetsAt: Date.now() + 3_600_000 },
      sevenDay: { usedPercent: 30, resetsAt: null },
      creditUsage: null,
      fetchedAt: Date.now(),
      status: 'ok',
      error: null,
    };

    const container = mount();
    const entries = container.querySelectorAll('[role="status"]');
    expect(entries).toHaveLength(2);
    expect(entries[1].textContent).toContain('Antigravity');
    expect(entries[1].textContent).toContain('85% left');

    entries[1].dispatchEvent(new MouseEvent('mouseenter'));
    const card = popover();
    expect(card?.textContent).toContain('Antigravity usage');
    expect(card?.textContent).toContain('5h');
    expect(card?.textContent).toContain('7d');
    expect(card?.textContent).toContain('70% left');
    expect(card?.textContent).not.toContain('Credits');
  });

  it('shows credit usage without a limit as "$X used"', () => {
    usage.claude.creditUsage = {
      used: 5,
      limit: null,
      currency: 'USD',
      usedPercent: null,
    };

    const container = mount();
    const entry = container.querySelector<HTMLElement>('[role="status"]');
    entry?.dispatchEvent(new MouseEvent('mouseenter'));
    const card = popover();
    expect(card?.textContent).toContain('Credits');
    expect(card?.textContent).toContain('$5.00 used');
    expect(card?.querySelector('[aria-label="Credit usage"]')).toBeNull();
  });
});
