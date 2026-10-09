import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { render } from 'solid-js/web';
import { TaskTitleBar } from './TaskTitleBar';
import { store, setStore } from '../store/core';
import type { Task } from '../store/types';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(), fireAndForget: vi.fn() }));

const task: Task = {
  id: 'one',
  name: 'one',
  projectId: 'project',
  branchName: 'one',
  worktreePath: '/tmp/one',
  agentIds: [],
  shellAgentIds: [],
  notes: '',
  lastPrompt: '',
  gitIsolation: 'worktree',
  baseBranch: 'main',
};

let container: HTMLDivElement;
let dispose: () => void;
const [pushing, setPushing] = createSignal(false);
const [pushSuccess, setPushSuccess] = createSignal(false);
const onFinish = vi.fn();

beforeEach(() => {
  setStore('tasks', reconcile({ one: { ...task } }));
  setStore('taskOrder', ['one']);
  setStore('focusMode', false);
  setPushing(false);
  setPushSuccess(false);
  onFinish.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  dispose = render(
    () => (
      <TaskTitleBar
        task={store.tasks.one}
        isActive
        onClose={() => undefined}
        onFinish={onFinish}
        pushing={pushing()}
        pushSuccess={pushSuccess()}
        onTitleEditRef={() => undefined}
      />
    ),
    container,
  );
});

afterEach(() => {
  dispose();
  container.remove();
});

const button = (name: string) =>
  [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name,
  );

it('offers Finish as a labelled action that reflects push progress', () => {
  const finish = button('Finish');
  expect(finish?.title).toBe('Finish: merge into main or push');
  finish?.click();
  expect(onFinish).toHaveBeenCalledOnce();

  setPushing(true);
  expect(finish?.textContent).toBe('Pushing…');
  setPushing(false);
  setPushSuccess(true);
  expect(finish?.textContent).toBe('Pushed');
  expect(finish?.dataset.state).toBe('pushed');
});

it('exposes canvas and focus as named toggles', () => {
  const canvas = button('Open canvas');
  expect(canvas?.getAttribute('aria-pressed')).toBe('false');
  canvas?.click();
  expect(canvas?.getAttribute('aria-pressed')).toBe('true');
  expect(canvas?.getAttribute('aria-label')).toBe('Close canvas');

  expect(button('Focus on this task')?.getAttribute('aria-pressed')).toBe('false');
  setStore('focusMode', true);
  expect(button('Exit focus mode')?.getAttribute('aria-pressed')).toBe('true');
});

it('keeps plain actions free of toggle state', () => {
  for (const name of ['Send task to back until new activity', 'Collapse task', 'Close task']) {
    const b = button(name);
    expect(b).toBeDefined();
    expect(b?.hasAttribute('aria-pressed')).toBe(false);
  }
});
