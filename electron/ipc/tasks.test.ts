import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  killAgent: vi.fn(),
  notifyAgentListChanged: vi.fn(),
  waitForAgentExit: vi.fn(async () => {}),
  cancelVerify: vi.fn(),
}));

vi.mock('./git.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./git.js')>()),
  createWorktree: mocks.createWorktree,
  removeWorktree: mocks.removeWorktree,
}));
vi.mock('./pty.js', () => ({
  killAgent: mocks.killAgent,
  notifyAgentListChanged: mocks.notifyAgentListChanged,
  waitForAgentExit: mocks.waitForAgentExit,
}));
vi.mock('./plans.js', () => ({ stopPlanWatcher: vi.fn() }));
vi.mock('./steps.js', () => ({ stopStepsWatcher: vi.fn() }));
vi.mock('./verify.js', () => ({ verificationRunner: { cancel: mocks.cancelVerify } }));

import { createTask, deleteTask } from './tasks.js';
import { reconcileWorktreeIntents } from './worktree-intents.js';

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('createTask', () => {
  it('journals the worktree before provisioning it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-code-tasks-'));
    tempDirs.push(root);
    const journal = path.join(root, 'worktree-intents.json');
    const projectRoot = path.join(root, 'repo');
    reconcileWorktreeIntents(journal, null);

    let journaledAtProvision: unknown[] = [];
    mocks.createWorktree.mockImplementation(async (repoRoot: string, branch: string) => {
      journaledAtProvision = JSON.parse(fs.readFileSync(journal, 'utf8')).intents;
      return { path: path.join(repoRoot, '.worktrees', branch), branch };
    });

    const task = await createTask('Fix login', projectRoot, [], 'task');

    expect(journaledAtProvision).toEqual([
      expect.objectContaining({
        worktreePath: task.worktree_path,
        branchName: task.branch_name,
        projectRoot,
      }),
    ]);
  });
});

describe('deleteTask', () => {
  it('kills agents and waits for their exits before removing the worktree', async () => {
    const order: string[] = [];
    mocks.killAgent.mockImplementation(() => {
      order.push('kill');
    });
    mocks.waitForAgentExit.mockImplementation(async () => {
      order.push('wait');
    });
    mocks.removeWorktree.mockImplementation(async () => {
      order.push('remove');
    });

    await deleteTask({
      taskId: 't-123',
      agentIds: ['a1', 'a2'],
      branchName: 'task/x',
      deleteBranch: true,
      projectRoot: '/nonexistent-root',
    });

    expect(mocks.cancelVerify).toHaveBeenCalledWith('t-123');
    expect(mocks.killAgent).toHaveBeenCalledTimes(2);
    expect(mocks.waitForAgentExit).toHaveBeenCalledTimes(2);
    expect(mocks.waitForAgentExit).toHaveBeenCalledWith('a1');
    expect(mocks.waitForAgentExit).toHaveBeenCalledWith('a2');
    expect(order).toEqual(['kill', 'kill', 'wait', 'wait', 'remove']);
    expect(mocks.removeWorktree).toHaveBeenCalledWith(
      '/nonexistent-root',
      'task/x',
      true,
      undefined,
    );
  });
});
