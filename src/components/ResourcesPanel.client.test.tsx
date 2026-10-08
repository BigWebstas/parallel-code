import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceSnapshot } from '../ipc/types';
import { ResourcesPanel } from './ResourcesPanel';

const { mockInvoke, snapshot } = vi.hoisted(() => {
  const snapshot: ResourceSnapshot = {
    cpuCount: 8,
    totalMemoryBytes: 16 * 1024 ** 3,
    sampledAt: 0,
    groups: [
      {
        kind: 'app',
        agentId: null,
        taskId: null,
        cpuPercent: 4,
        memoryBytes: 500 * 1024 ** 2,
        processes: [{ pid: 10, name: 'Browser', cpuPercent: 4, memoryBytes: 500 * 1024 ** 2 }],
      },
      {
        kind: 'agent',
        agentId: 'a1',
        taskId: 't1',
        cpuPercent: 80,
        memoryBytes: 1024 ** 3,
        processes: [{ pid: 21, name: 'claude', cpuPercent: 80, memoryBytes: 1024 ** 3 }],
      },
    ],
  };
  return { mockInvoke: vi.fn(async () => snapshot), snapshot };
});

vi.mock('../lib/ipc', () => ({ invoke: mockInvoke }));
vi.mock('../store/store', () => ({
  store: {
    tasks: { t1: { name: 'Fix login' } },
    agents: { a1: { def: { name: 'Claude Code' } } },
    terminals: {},
  },
}));

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.replaceChildren();
  mockInvoke.mockClear();
  vi.useRealTimers();
});

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  disposers.push(render(() => <ResourcesPanel />, container));
  return container;
}

const panel = () => document.querySelector<HTMLElement>('[data-testid="resources-panel"]');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ResourcesPanel', () => {
  it('does not sample until opened', () => {
    mount();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(panel()).toBeNull();
  });

  it('lists groups by cpu with task names, and expands into processes', async () => {
    const container = mount();
    container.querySelector('button')?.click();
    await flush();
    const rows = [...(panel()?.querySelectorAll('button[aria-expanded]') ?? [])];
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Fix login · Claude Code10%1.0 GB'),
      expect.stringContaining('Parallel Code0.5%500 MB'),
    ]);
    expect(panel()?.textContent).not.toContain('claude 21');
    (rows[0] as HTMLButtonElement).click();
    expect(panel()?.textContent).toContain('claude 21');
    expect(snapshot.groups).toHaveLength(2);
  });

  it('keeps an expanded row open across polls and stops polling when closed', async () => {
    vi.useFakeTimers();
    const container = mount();
    container.querySelector('button')?.click();
    await vi.advanceTimersByTimeAsync(0);
    panel()?.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(panel()?.textContent).toContain('claude 21');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel()).toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('waits for a slow sample instead of stacking requests', async () => {
    vi.useFakeTimers();
    let resolve: (value: ResourceSnapshot) => void = () => {};
    mockInvoke.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const container = mount();
    container.querySelector('button')?.click();
    await vi.advanceTimersByTimeAsync(6000);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    resolve(snapshot);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('drops a reply that lands after closing, so reopening starts fresh', async () => {
    let resolve: (value: ResourceSnapshot) => void = () => {};
    mockInvoke.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    mockInvoke.mockImplementationOnce(() => new Promise(() => {}));
    const container = mount();
    const button = container.querySelector('button');
    button?.click();
    button?.click();
    resolve(snapshot);
    await flush();
    button?.click();
    await flush();
    expect(panel()?.textContent).toContain('Measuring');
    expect(panel()?.textContent).not.toContain('Fix login');
  });

  it('shows an error when sampling fails', async () => {
    mockInvoke.mockImplementationOnce(() => Promise.reject(new Error('EPERM')));
    const container = mount();
    container.querySelector('button')?.click();
    await flush();
    expect(panel()?.textContent).toContain('Could not read processes: Error: EPERM');
  });
});
