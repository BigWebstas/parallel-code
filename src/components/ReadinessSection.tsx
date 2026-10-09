import { Show, createSignal, untrack, type JSX } from 'solid-js';
import { VERIFY_CHECK_ID } from '../../electron/shared/evidence';
import { theme } from '../lib/theme';
import { buildEvidence, getTaskChecks, runTaskVerification } from '../store/store';
import type { Task } from '../store/types';
import { evidenceButtonStyle } from './EvidenceDetails';
import { PlayIcon } from './icons';

interface ReadinessSectionProps {
  task: Task;
  children: JSX.Element;
}

const toggleStyle = {
  background: 'none',
  border: 'none',
  padding: '8px 0',
  color: theme.fgMuted,
  cursor: 'pointer',
  'font-size': '13px',
};

/**
 * Folded until evidence was built or a check ran, with those two actions in the
 * header so they stay reachable. After that it folds only on a click, never on
 * a status change.
 */
export function ReadinessSection(props: ReadinessSectionProps) {
  const [open, setOpen] = createSignal(
    untrack(() => Boolean(props.task.evidence || props.task.verificationRun)),
  );
  const verifyCommand = () =>
    getTaskChecks(props.task.id).find((check) => check.id === VERIFY_CHECK_ID)?.command;
  const build = () => {
    setOpen(true);
    void buildEvidence(props.task.id, { trigger: 'manual' });
  };
  const runVerify = () => {
    setOpen(true);
    void runTaskVerification(props.task.id);
  };

  return (
    <section aria-label="Readiness and checks" style={{ margin: '28px 0', 'font-size': '13px' }}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap' }}>
        <button
          type="button"
          aria-expanded={open()}
          style={toggleStyle}
          onClick={() => setOpen(!open())}
        >
          {open() ? '▾' : '▸'} Readiness and checks
        </button>
        <Show when={!open()}>
          <button type="button" style={evidenceButtonStyle} onClick={build}>
            Build evidence
          </button>
          <Show when={verifyCommand()}>
            {(command) => (
              <button
                class="btn-with-icon"
                type="button"
                style={evidenceButtonStyle}
                title={`Run ${command()} in the task worktree`}
                onClick={runVerify}
              >
                <PlayIcon size={12} />
                Run
              </button>
            )}
          </Show>
        </Show>
      </div>
      {/* Hidden rather than unmounted, so folding keeps the panel's local state. */}
      <div hidden={!open()} style={{ 'margin-top': '8px' }}>
        {props.children}
      </div>
    </section>
  );
}
