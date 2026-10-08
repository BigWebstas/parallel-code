import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { IPC } from '../../electron/ipc/channels';
import { invoke } from '../lib/ipc';
import { theme } from '../lib/theme';
import { sf } from '../lib/fontScale';
import { store } from '../store/store';
import type { ResourceGroup, ResourceSnapshot } from '../ipc/types';
import { ActivityIcon } from './icons';
import { formatBytes, formatCpu, groupKey, groupLabel } from './resources-format';

const POLL_INTERVAL_MS = 2000;
const PANEL_WIDTH = 440;

const numberCell = { width: '64px', 'text-align': 'right', 'flex-shrink': '0' } as const;
const rowStyle = { display: 'flex', 'align-items': 'center', gap: '8px', padding: '3px 6px' };

function GroupRow(props: {
  group: ResourceGroup;
  label: string;
  cpuCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  const open = () => props.open;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open()}
        onClick={() => props.onToggle()}
        style={{
          ...rowStyle,
          width: '100%',
          background: 'none',
          border: 'none',
          color: theme.fg,
          font: 'inherit',
          cursor: 'pointer',
          'text-align': 'left',
        }}
      >
        <span style={{ width: '10px', color: theme.fgSubtle }}>{open() ? '▾' : '▸'}</span>
        <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
          {props.label}
        </span>
        <span style={numberCell}>{formatCpu(props.group.cpuPercent, props.cpuCount)}</span>
        <span style={numberCell}>{formatBytes(props.group.memoryBytes)}</span>
      </button>
      <Show when={open()}>
        <For each={props.group.processes}>
          {(proc) => (
            <div style={{ ...rowStyle, 'padding-left': '24px', color: theme.fgMuted }}>
              <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                {proc.name} <span style={{ color: theme.fgSubtle }}>{proc.pid}</span>
              </span>
              <span style={numberCell}>{formatCpu(proc.cpuPercent, props.cpuCount)}</span>
              <span style={numberCell}>{formatBytes(proc.memoryBytes)}</span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function ResourcesPopover(props: { snapshot: ResourceSnapshot | null; error: string | null }) {
  const groups = () =>
    [...(props.snapshot?.groups ?? [])].sort((a, b) => b.cpuPercent - a.cpuPercent);
  // Rows are rebuilt on every poll, so expansion lives here, keyed by group.
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const total = (key: 'cpuPercent' | 'memoryBytes') =>
    groups().reduce((sum, group) => sum + group[key], 0);

  return (
    <>
      <div
        style={{
          ...rowStyle,
          'padding-left': '24px',
          color: theme.fgSubtle,
          'text-transform': 'uppercase',
          'letter-spacing': '0.05em',
          'font-weight': '600',
        }}
      >
        <span style={{ flex: '1' }}>Resources</span>
        <span style={numberCell}>CPU</span>
        <span style={numberCell}>Memory</span>
      </div>
      <Show when={props.error}>
        <div style={{ ...rowStyle, color: theme.warning }}>{props.error}</div>
      </Show>
      <Show when={props.snapshot} fallback={<div style={rowStyle}>Measuring…</div>}>
        {(snapshot) => (
          <>
            <div style={{ overflow: 'auto', 'max-height': '50vh' }}>
              <For each={groups()}>
                {(group) => (
                  <GroupRow
                    group={group}
                    label={groupLabel(group, store)}
                    cpuCount={snapshot().cpuCount}
                    open={expanded().has(groupKey(group))}
                    onToggle={() => toggle(groupKey(group))}
                  />
                )}
              </For>
            </div>
            <div
              style={{ ...rowStyle, 'border-top': `1px solid ${theme.border}`, color: theme.fg }}
            >
              <span style={{ flex: '1', color: theme.fgSubtle }}>
                Total · CPU of all {snapshot().cpuCount} cores
              </span>
              <span style={numberCell}>{formatCpu(total('cpuPercent'), snapshot().cpuCount)}</span>
              <span style={numberCell}>{formatBytes(total('memoryBytes'))}</span>
            </div>
          </>
        )}
      </Show>
    </>
  );
}

/**
 * Samples now and every interval until stopped. Skips a tick while a request
 * is in flight, and drops replies that land after stop so a reopened panel
 * never flashes a stale snapshot.
 */
function pollSnapshots(
  onSnapshot: (snapshot: ResourceSnapshot) => void,
  onError: (message: string) => void,
): () => void {
  let stopped = false;
  let busy = false;
  const tick = () => {
    if (busy) return;
    busy = true;
    invoke<ResourceSnapshot>(IPC.GetResourceUsage)
      .then(
        (result) => !stopped && onSnapshot(result),
        (err: unknown) => !stopped && onError(String(err)),
      )
      .finally(() => (busy = false));
  };
  tick();
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * Bottom-right status bar button that opens a live CPU/memory breakdown per
 * agent, shell, and app process. Samples only while the panel is open.
 */
export function ResourcesPanel() {
  const [open, setOpen] = createSignal(false);
  const [bottom, setBottom] = createSignal(0);
  const [snapshot, setSnapshot] = createSignal<ResourceSnapshot | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  let button: HTMLButtonElement | undefined;
  let panel: HTMLDivElement | undefined;

  createEffect(() => {
    if (!open()) return;
    const stopPolling = pollSnapshots(
      (result) => {
        setSnapshot(result);
        setError(null);
      },
      (message) => setError(`Could not read processes: ${message}`),
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !button?.contains(target) && !panel?.contains(target))
        setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    onCleanup(() => {
      stopPolling();
      setSnapshot(null);
      setError(null);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    });
  });

  const toggle = () => {
    if (button) setBottom(window.innerHeight - button.getBoundingClientRect().top + 6);
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open()}
        title="CPU and memory per agent"
        onClick={toggle}
        style={{
          'margin-left': 'auto',
          'flex-shrink': '0',
          background: open() ? theme.bgHover : 'none',
          border: 'none',
          'border-radius': 'var(--radius-xs)',
          color: open() ? theme.fg : theme.fgMuted,
          font: 'inherit',
          padding: '1px 6px',
          cursor: 'pointer',
        }}
      >
        <ActivityIcon size={11} style={{ 'vertical-align': '-1px', 'margin-right': '4px' }} />
        Resources
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={panel}
            role="region"
            aria-label="Resources"
            data-testid="resources-panel"
            style={{
              position: 'fixed',
              right: '8px',
              bottom: `${bottom()}px`,
              width: `${PANEL_WIDTH}px`,
              'max-width': 'calc(100vw - 16px)',
              'z-index': '1000',
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              'border-radius': 'var(--radius-sm)',
              'box-shadow': '0 4px 16px rgba(0, 0, 0, 0.3)',
              padding: '6px 4px',
              'font-family': "'JetBrains Mono', monospace",
              'font-size': sf(11),
              color: theme.fgMuted,
              'white-space': 'nowrap',
            }}
          >
            <ResourcesPopover snapshot={snapshot()} error={error()} />
          </div>
        </Portal>
      </Show>
    </>
  );
}
