import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { theme } from '../lib/theme';
import { SyncIcon } from './icons';

interface TaskClosingOverlayProps {
  closingStatus: string | undefined;
  closingError: string | undefined;
  onRetry: () => void;
  /** Windows only: close the task and leave its locked folder to be deleted later. */
  onKeepFolder?: () => void;
}

/** After this long "Closing task..." says what it is waiting for. */
const SLOW_CLOSE_HINT_MS = 6_000;

export function TaskClosingOverlay(props: TaskClosingOverlayProps) {
  const [slow, setSlow] = createSignal(false);
  createEffect(() => {
    setSlow(false);
    if (props.closingStatus !== 'closing') return;
    const timer = setTimeout(() => setSlow(true), SLOW_CLOSE_HINT_MS);
    onCleanup(() => clearTimeout(timer));
  });
  return (
    <Show when={props.closingStatus && props.closingStatus !== 'removing'}>
      <div
        style={{
          position: 'absolute',
          inset: '0',
          'z-index': '50',
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'center',
          gap: '12px',
          'border-radius': 'var(--radius-lg)',
          color: theme.fg,
        }}
      >
        <Show when={props.closingStatus === 'closing'}>
          <div style={{ 'font-size': '14px', color: theme.fgMuted }}>Closing task...</div>
          <Show when={slow()}>
            <div
              style={{
                'font-size': '12px',
                color: theme.fgMuted,
                'max-width': '260px',
                'text-align': 'center',
              }}
            >
              Waiting for the task's folder to be released. This gives up after about 30 seconds.
            </div>
          </Show>
        </Show>
        <Show when={props.closingStatus === 'error'}>
          <div style={{ 'font-size': '14px', color: theme.error, 'font-weight': '600' }}>
            Close failed
          </div>
          <div
            style={{
              'font-size': '12px',
              color: theme.fgMuted,
              'max-width': '260px',
              'text-align': 'center',
              'word-break': 'break-word',
            }}
          >
            {props.closingError}
          </div>
          <button
            class="btn-with-icon"
            onClick={(e) => {
              e.stopPropagation();
              props.onRetry();
            }}
            style={{
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              color: theme.fg,
              padding: '6px 16px',
              'border-radius': 'var(--radius-sm)',
              cursor: 'pointer',
              'font-size': '13px',
            }}
          >
            <SyncIcon size={14} />
            Retry
          </button>
          <Show when={props.onKeepFolder}>
            {(keepFolder) => (
              <button
                class="btn-with-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  keepFolder()();
                }}
                style={{
                  background: 'transparent',
                  border: `1px solid ${theme.border}`,
                  color: theme.fgMuted,
                  padding: '6px 16px',
                  'border-radius': 'var(--radius-sm)',
                  cursor: 'pointer',
                  'font-size': '13px',
                }}
              >
                Remove task, keep folder
              </button>
            )}
          </Show>
        </Show>
      </div>
    </Show>
  );
}
