import { isPlanApprovalTool } from '../../electron/agent-hooks/status';

interface HookEventLike {
  event: string;
  toolName?: string;
}

/** Claude asking to have a plan approved: the moment to put the plan on the canvas. */
export function isPlanApprovalEvent(event: HookEventLike): boolean {
  return event.event === 'PreToolUse' && isPlanApprovalTool(event.toolName);
}
