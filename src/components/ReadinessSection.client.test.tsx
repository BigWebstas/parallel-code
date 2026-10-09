import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../store/types';
import { buildEvidence, getTaskChecks, runTaskVerification } from '../store/store';
import { ReadinessSection } from './ReadinessSection';

vi.mock('../store/store', () => ({
  buildEvidence: vi.fn(async () => undefined),
  runTaskVerification: vi.fn(async () => undefined),
  getTaskChecks: vi.fn(() => [{ id: 'verify', name: 'Verify', command: 'npm test' }]),
}));
vi.mock('../lib/theme', () => ({ theme: {} }));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

const button = (text: string) =>
  [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === text);
const body = () => document.querySelector<HTMLElement>('[data-testid="body"]')?.parentElement;

function mount(overrides: Partial<Task> = {}) {
  const task = { id: 'task', projectId: 'project', ...overrides } as Task;
  dispose = render(
    () => (
      <ReadinessSection task={task}>
        <div data-testid="body" />
      </ReadinessSection>
    ),
    document.body,
  );
}

describe('ReadinessSection', () => {
  it('starts folded with the build and run actions in its header', () => {
    mount();
    expect(body()?.hidden).toBe(true);
    expect(button('Build evidence')).toBeDefined();
    expect(button('Run')).toBeDefined();
  });

  it.each([
    ['Build evidence', buildEvidence],
    ['Run', runTaskVerification],
  ] as const)('expands and starts the action on %s', (label, action) => {
    mount();
    button(label)?.click();
    expect(action).toHaveBeenCalledWith(
      'task',
      ...(label === 'Run' ? [] : [{ trigger: 'manual' }]),
    );
    expect(body()?.hidden).toBe(false);
    expect(button('Build evidence')).toBeUndefined();
  });

  it('expands and folds on a header click', () => {
    mount();
    button('▸ Readiness and checks')?.click();
    expect(body()?.hidden).toBe(false);
    button('▾ Readiness and checks')?.click();
    expect(body()?.hidden).toBe(true);
  });

  it.each<Partial<Task>>([
    { evidence: {} as Task['evidence'] },
    { verificationRun: {} as Task['verificationRun'] },
  ])('starts open once evidence or a check run exists: %j', (overrides) => {
    mount(overrides);
    expect(body()?.hidden).toBe(false);
  });

  it('hides Run without a verify command', () => {
    vi.mocked(getTaskChecks).mockReturnValueOnce([]);
    mount();
    expect(button('Run')).toBeUndefined();
  });
});
