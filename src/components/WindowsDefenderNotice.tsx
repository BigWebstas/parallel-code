import { createSignal, Show } from 'solid-js';
import { store } from '../store/store';
import { dismissDefenderNotice } from '../store/defender-notice';
import { defenderExclusionCommand } from '../lib/defender-exclusion';

const isWindows = navigator.userAgent.includes('Win');

/**
 * One-time tip for Windows: Defender's real-time scan of every file git and the
 * agents touch is a common cause of slow git and npm. Offers the command that
 * excludes the project folders (worktrees live inside them) and says what that
 * gives up, then stays dismissed.
 */
export function WindowsDefenderNotice() {
  const [copied, setCopied] = createSignal(false);
  const command = () => defenderExclusionCommand(store.projects.map((project) => project.path));
  const copy = () => {
    void navigator.clipboard.writeText(command()).then(
      () => setCopied(true),
      (err: unknown) => console.warn('Could not copy the Defender command:', err),
    );
  };

  return (
    <Show
      when={
        isWindows &&
        !store.defenderNoticeDismissed &&
        // One notice at a time: they share a spot at the top of the window.
        store.keybindingMigrationDismissed &&
        store.projects.length > 0
      }
    >
      <div class="keybinding-migration-notice" role="region" aria-label="Speed up git on Windows">
        <div>
          <p style={{ margin: '0 0 8px' }}>
            Windows Defender scans every file git and your agents touch, which can make git and npm
            several times slower. Excluding your project folders from real-time scanning fixes that.
            Only do this for folders you trust: Defender stops scanning files there as they change.
          </p>
          <p style={{ margin: '0 0 6px' }}>Run this in PowerShell as administrator:</p>
          <pre
            style={{
              margin: '0 0 8px',
              padding: '6px 8px',
              'white-space': 'pre-wrap',
              'word-break': 'break-all',
              'border-radius': 'var(--radius-sm, 4px)',
              background: 'var(--bg)',
              'font-size': '12px',
            }}
          >
            {command()}
          </pre>
          <button type="button" class="keybinding-migration-notice-action" onClick={copy}>
            {copied() ? 'Copied' : 'Copy command'}
          </button>{' '}
          or{' '}
          <button
            type="button"
            class="keybinding-migration-notice-action secondary"
            onClick={() => dismissDefenderNotice()}
          >
            dismiss
          </button>
          .
        </div>
        <button
          type="button"
          class="keybinding-migration-notice-close"
          aria-label="Dismiss the Windows Defender tip"
          onClick={() => dismissDefenderNotice()}
        >
          &times;
        </button>
      </div>
    </Show>
  );
}
