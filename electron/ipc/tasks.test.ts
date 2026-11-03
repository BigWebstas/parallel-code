import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  killAgent: vi.fn(),
  getAgentPid: vi.fn((_agentId: string): number | undefined => undefined),
  snapshotDescendants: vi.fn(async (_pids: number[]) => [] as unknown[]),
  endLeftovers: vi.fn(async (_rows: unknown[]) => [] as unknown[]),
  forceKillSurvivingAgent: vi.fn((_agentId: string) => false),
  notifyAgentListChanged: vi.fn(),
  waitForAgentExit: vi.fn(async (_agentId: string, _timeoutMs?: number) => {}),
  requestAgentExit: vi.fn(async (_agentId: string) => true),
  isBeyondReach: vi.fn((_pid: number) => false),
  findUnreachable: vi.fn(async (_pids: number[], _rows: unknown[]) => [] as unknown[]),
  cancelVerify: vi.fn(),
  stopPlanWatcher: vi.fn(),
  stopPlanWatchersForPath: vi.fn(),
  resolvePrCheckout: vi.fn(),
  localBranchExists: vi.fn(),
}));

vi.mock('./git.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./git.js')>()),
  createWorktree: mocks.createWorktree,
  removeWorktree: mocks.removeWorktree,
}));
vi.mock('./agent-descendants.js', () => ({
  snapshotDescendants: mocks.snapshotDescendants,
  endLeftovers: mocks.endLeftovers,
}));
vi.mock('./pty.js', () => ({
  getAgentPid: mocks.getAgentPid,
  killAgent: mocks.killAgent,
  forceKillSurvivingAgent: mocks.forceKillSurvivingAgent,
  notifyAgentListChanged: mocks.notifyAgentListChanged,
  waitForAgentExit: mocks.waitForAgentExit,
  requestAgentExit: mocks.requestAgentExit,
}));
vi.mock('./unreachable-processes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./unreachable-processes.js')>()),
  isBeyondReach: mocks.isBeyondReach,
  findUnreachable: mocks.findUnreachable,
}));
vi.mock('./plans.js', () => ({
  stopPlanWatcher: mocks.stopPlanWatcher,
  stopPlanWatchersForPath: mocks.stopPlanWatchersForPath,
}));
vi.mock('./verify.js', () => ({ verificationRunner: { cancel: mocks.cancelVerify } }));
vi.mock('../github/pr-checkout.js', () => ({
  resolvePrCheckout: mocks.resolvePrCheckout,
  localBranchExists: mocks.localBranchExists,
}));

import { createPrTask, createTask, deleteTask } from './tasks.js';
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
    expect(mocks.stopPlanWatcher).toHaveBeenCalledWith('t-123');
    expect(mocks.stopPlanWatchersForPath).toHaveBeenCalledWith(
      path.join('/nonexistent-root', '.worktrees', 'task/x'),
    );
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

  it('ends an agent that outlived the tree kill, and waits again, before removing', async () => {
    const order: string[] = [];
    mocks.waitForAgentExit.mockImplementation(async (id: string, ms?: number) => {
      order.push(`wait ${id}${ms ? ` ${ms}` : ''}`);
    });
    mocks.forceKillSurvivingAgent.mockImplementation((id: string) => {
      order.push(`force ${id}`);
      return id === 'stuck';
    });
    mocks.removeWorktree.mockImplementation(async () => {
      order.push('remove');
    });

    await deleteTask({
      taskId: 't-1',
      agentIds: ['stuck', 'gone'],
      branchName: 'task/x',
      deleteBranch: true,
      projectRoot: '/nonexistent-root',
    });

    expect(order).toEqual([
      'wait stuck',
      'wait gone',
      'force stuck',
      'force gone',
      'wait stuck 3000',
      'remove',
    ]);
  });

  describe('agents this app cannot end', () => {
    const base = {
      taskId: 't-1',
      agentIds: ['elevated', 'plain'],
      branchName: 'task/x',
      deleteBranch: true,
      projectRoot: '/nonexistent-root',
    };

    it('asks an agent beyond our reach to exit, before the kill closes its console', async () => {
      const order: string[] = [];
      mocks.getAgentPid.mockImplementation((id: string) => (id === 'elevated' ? 111 : 222));
      mocks.isBeyondReach.mockImplementation((pid: number) => pid === 111);
      mocks.requestAgentExit.mockImplementation(async (id: string) => {
        order.push(`exit ${id}`);
        return true;
      });
      mocks.killAgent.mockImplementation((id: string) => {
        order.push(`kill ${id}`);
      });

      await deleteTask(base);

      expect(order).toEqual(['exit elevated', 'kill elevated', 'kill plain']);
    });

    it('does not type into agents it can end normally', async () => {
      mocks.getAgentPid.mockReturnValue(222);
      mocks.isBeyondReach.mockReturnValue(false);

      await deleteTask(base);

      expect(mocks.requestAgentExit).not.toHaveBeenCalled();
    });

    it('names the elevated processes when the worktree cannot be removed', async () => {
      mocks.getAgentPid.mockReturnValue(111);
      mocks.removeWorktree.mockRejectedValue(new Error('EBUSY: resource busy or locked'));
      mocks.findUnreachable.mockResolvedValue([
        { pid: 111, ppid: 1, name: 'claude.exe', memoryBytes: 0 },
        { pid: 112, ppid: 111, name: 'node.exe', memoryBytes: 0 },
      ]);

      const failure = deleteTask(base);

      await expect(failure).rejects.toThrow(
        /2 processes from this task are running with administrator rights/,
      );
      await expect(failure).rejects.toThrow(/taskkill \/F \/T \/PID 111 —/);
      await expect(failure).rejects.toThrow(/EBUSY: resource busy or locked/);
    });

    it('passes the original failure on when nothing out of reach is left', async () => {
      const original = new Error('EBUSY: resource busy or locked');
      mocks.removeWorktree.mockRejectedValue(original);
      mocks.findUnreachable.mockResolvedValue([]);

      await expect(deleteTask(base)).rejects.toBe(original);
    });
  });
});

describe('createPrTask', () => {
  const pr = {
    headSha: 'abc123',
    headRefName: 'feature/login',
    baseRefName: 'develop',
    isCrossRepository: false,
    url: 'https://github.com/o/r/pull/5',
    remote: 'origin',
  };

  function setup(
    opts: {
      pr?: Partial<Omit<typeof pr, 'headRefName'>> & { headRefName?: string | null };
      localBranches?: string[];
    } = {},
  ): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-code-pr-task-'));
    tempDirs.push(root);
    reconcileWorktreeIntents(path.join(root, 'worktree-intents.json'), null);
    mocks.resolvePrCheckout.mockResolvedValue({ ...pr, ...opts.pr });
    mocks.localBranchExists.mockImplementation(async (_root: string, branch: string) =>
      (opts.localBranches ?? ['develop']).includes(branch),
    );
    mocks.createWorktree.mockImplementation(async (repoRoot: string, branch: string) => ({
      path: `${repoRoot}/.worktrees/${branch}`,
      branch,
    }));
    return path.join(root, 'repo');
  }

  afterEach(() => {
    mocks.createWorktree.mockReset();
  });

  it('reuses the PR branch for same-repo PRs so a push updates the PR', async () => {
    const projectRoot = setup();
    const task = await createPrTask(projectRoot, 5, [], 'task');
    expect(mocks.createWorktree).toHaveBeenCalledWith(projectRoot, 'feature/login', [], 'abc123');
    expect(task).toMatchObject({
      branch_name: 'feature/login',
      pr_url: pr.url,
      base_branch: 'develop',
    });
  });

  it('gives fork PRs a prefixed local branch', async () => {
    const projectRoot = setup({ pr: { isCrossRepository: true } });
    const task = await createPrTask(projectRoot, 5, [], 'Agent Work');
    expect(task.branch_name).toMatch(/^agent-work\/pr-5-[0-9a-f]{6}$/);
  });

  it('gives PRs fetched from a non-origin remote a prefixed branch', async () => {
    const projectRoot = setup({ pr: { remote: 'upstream' } });
    const task = await createPrTask(projectRoot, 5, [], 'task');
    expect(task.branch_name).toMatch(/^task\/pr-5-[0-9a-f]{6}$/);
  });

  it('leaves the base empty when the PR base is not a local branch', async () => {
    const projectRoot = setup({ localBranches: [] });
    const task = await createPrTask(projectRoot, 5, [], 'task');
    expect(task.base_branch).toBe('');
  });

  it('uses a prefixed branch when the PR branch already exists locally', async () => {
    const projectRoot = setup({ localBranches: ['develop', 'feature/login'] });
    const task = await createPrTask(projectRoot, 5, [], 'task');
    expect(task.branch_name).toMatch(/^task\/pr-5-[0-9a-f]{6}$/);
  });

  it('uses a prefixed branch when the PR branch name is not usable locally', async () => {
    const projectRoot = setup({ pr: { headRefName: null } });
    const task = await createPrTask(projectRoot, 5, [], 'task');
    expect(task.branch_name).toMatch(/^task\/pr-5-[0-9a-f]{6}$/);
  });
});
