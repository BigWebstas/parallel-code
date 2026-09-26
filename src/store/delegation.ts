import { createStore } from 'solid-js/store';
import { IPC } from '../../electron/ipc/channels';
import type {
  DelegationChanged,
  DelegationRequest,
  DelegationState,
  PeerMessage,
  TaskAuthorityInput,
} from '../../electron/shared/delegation-types';
import { invoke } from '../lib/ipc';
import { warn as logWarn } from '../lib/log';
import { store, setStore } from './core';
import { isLandedTaskState } from './landing';
import type { AgentDef } from '../ipc/types';
import type { PersistedTask, Project, Task } from './types';

export const [delegationStates, setDelegationStates] = createStore<Record<string, DelegationState>>(
  {},
);

export function delegationRequest<T>(request: DelegationRequest): Promise<T> {
  return invoke<T>(IPC.DelegationRequest, request);
}

/** Acknowledge the backend policy before displaying or persisting a change. */
export async function setMcpOrchestrationEnabled(enabled: boolean): Promise<void> {
  await delegationRequest({ action: 'orchestrationSetting', enabled });
  setStore('mcpOrchestrationEnabled', enabled);
}

export function taskAuthorityInput(
  task: Task | PersistedTask,
  project: Project,
  agent: AgentDef | undefined,
  agentEnvFile?: string,
): TaskAuthorityInput {
  return {
    taskId: task.id,
    name: task.name,
    projectId: project.id,
    projectRoot: project.path,
    worktreePath: task.worktreePath,
    branchName: task.branchName,
    gitIsolation: task.gitIsolation,
    parentTaskId: task.coordinatedBy,
    coordinatorMode: task.coordinatorMode,
    autoMergeChildren: task.autoMergeChildren,
    autoSendChildUpdates: task.autoSendChildUpdates,
    externalWorktree: task.externalWorktree,
    integrationPolicy: task.integrationPolicy,
    delegationPaused: task.delegationPaused,
    delegationParent: task.delegationParent,
    agentCommand: agent?.command ?? '',
    agentArgs: agent?.args ?? [],
    agentEnvFile,
    dockerMode: task.dockerMode,
    dockerImage: task.dockerImage,
    verifyCommand: project.verifyCommand,
    maxConcurrentTasks: task.maxConcurrentTasks,
    propagateSkipPermissions: task.propagateSkipPermissions,
  };
}

export async function registerTaskAuthority(task: Task, agent?: AgentDef): Promise<void> {
  const project = store.projects.find((p) => p.id === task.projectId);
  if (!project) throw new Error('Project not found');
  await delegationRequest({
    action: 'register',
    task: taskAuthorityInput(
      task,
      project,
      agent,
      agent ? store.agentEnvFiles[agent.id] : undefined,
    ),
  });
}

export function applyDelegationChange(change: DelegationChanged): void {
  if ('state' in change) {
    setDelegationStates(change.taskId, change.state);
    if (store.tasks[change.taskId]) {
      setStore('tasks', change.taskId, 'delegationPaused', change.state.paused);
      if (change.state.attempts.length > 0)
        setStore('tasks', change.taskId, 'delegationParent', true);
    }
  } else {
    for (const id of change.detachedChildIds) {
      if (!store.tasks[id]) continue;
      setStore('tasks', id, {
        coordinatedBy: undefined,
        controlledBy: undefined,
        mcpConfigPath: undefined,
        mcpLaunchArgs: undefined,
        integrationPolicy: undefined,
        delegationPaused: true,
        mcpStartupStatus: undefined,
        mcpStartupError: undefined,
      });
    }
  }
}

export async function refreshDelegationState(taskId: string): Promise<void> {
  const state = await delegationRequest<DelegationState>({ action: 'state', taskId });
  if (state) applyDelegationChange({ taskId, state });
}

const peerDeliveriesInFlight = new Set<string>();

/** Delivery runs independently of task panels, including for background children. */
export function startPeerMessageDelivery(onDelivered: (message: PeerMessage) => void): () => void {
  let disposed = false;
  const loggedFailures = new Set<string>();
  const timer = setInterval(() => {
    if (!store.mcpOrchestrationEnabled) return;
    const recipients = new Set<string>();
    for (const state of Object.values(delegationStates)) {
      for (const message of state.messages) {
        if (message.state !== 'waiting') continue;
        const { taskId, agentId, sessionInstanceId } = message.recipient;
        if (recipients.has(agentId)) continue;
        recipients.add(agentId);
        const task = store.tasks[taskId];
        const agent = store.agents[agentId];
        if (
          peerDeliveriesInFlight.has(agentId) ||
          !task ||
          !agent ||
          agent.taskId !== taskId ||
          !task.agentIds.includes(agentId) ||
          agent.status === 'exited' ||
          (agent.sessionInstanceId && agent.sessionInstanceId !== sessionInstanceId) ||
          task.closingStatus === 'closing' ||
          task.closingStatus === 'removing' ||
          isLandedTaskState(task.landingState) ||
          task.delegationPaused ||
          state.paused ||
          task.controlledBy === 'human' ||
          task.initialPrompt ||
          task.automationWriteInFlight ||
          task.promptDraftActive ||
          task.promptDraft?.trim() ||
          task.terminalInputPending ||
          (task.userActivityHoldUntil ?? 0) > Date.now() ||
          task.prefillPrompt ||
          task.stagedNotification
        )
          continue;
        const generation = agent.generation;
        peerDeliveriesInFlight.add(agentId);
        void delegationRequest<{
          deliveryId: string;
          state: PeerMessage['state'];
          reason?: string;
        }>({ action: 'deliverMessage', deliveryId: message.deliveryId, agentId, sessionInstanceId })
          .then((result) => {
            if (disposed) return;
            setDelegationStates(taskId, 'messages', (m) => m.deliveryId === result.deliveryId, {
              state: result.state,
              reason: result.reason,
            });
            if (result.state === 'delivered' && store.agents[agentId]?.generation === generation)
              onDelivered(message);
          })
          .catch((error: unknown) => {
            if (disposed || loggedFailures.has(message.deliveryId)) return;
            loggedFailures.add(message.deliveryId);
            logWarn('delegation.delivery', 'Peer message delivery failed', {
              deliveryId: message.deliveryId,
              error: String(error),
            });
          })
          .finally(() => peerDeliveriesInFlight.delete(agentId));
      }
    }
  }, 1_000);
  return () => {
    disposed = true;
    clearInterval(timer);
  };
}

export function isSupportedDelegationAgent(agent: AgentDef): boolean {
  return ['claude', 'codex', 'copilot'].includes(agent.command.split('/').pop() ?? '');
}

export function hasUserMcpConfiguration(args: string[]): boolean {
  return args.some(
    (arg) =>
      /^(--mcp-config|--additional-mcp-config|--strict-mcp-config)(=|$)/.test(arg) ||
      /^(?:(?:--config|-c)=)?mcp_servers(?:\.|\[|=)/.test(arg),
  );
}

interface PeerComposer {
  getText(): string;
  setText(value: string): void;
}

/** A composer belongs to the first pane; peer messages never select a different pane. */
export function canUsePeerComposer(
  task: Task,
  message: PeerMessage,
  composer: PeerComposer | undefined,
  enabled: boolean,
): boolean {
  const agentId = task.agentIds[0];
  return (
    enabled &&
    !!composer &&
    message.state === 'waiting' &&
    !peerDeliveriesInFlight.has(agentId) &&
    message.recipient.taskId === task.id &&
    message.recipient.agentId === agentId &&
    !!store.agents[agentId]?.sessionInstanceId &&
    store.agents[agentId].sessionInstanceId === message.recipient.sessionInstanceId &&
    composer.getText() === ''
  );
}

/** Called synchronously by the explicit Review action; never submits terminal input. */
export function usePeerComposer(
  task: Task,
  message: PeerMessage,
  composer: PeerComposer | undefined,
  enabled: boolean,
): boolean {
  if (!composer || !canUsePeerComposer(task, message, composer, enabled)) return false;
  composer.setText(message.prompt);
  setStore('tasks', task.id, 'promptDraftActive', true);
  return true;
}
