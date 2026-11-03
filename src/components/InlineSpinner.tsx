import { splitProps, type JSX } from 'solid-js';
import { createSpinnerAngle } from '../lib/spinner-clock';

type InlineSpinnerProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'style' | 'children'> & {
  style?: JSX.CSSProperties;
};

/**
 * The small loading ring. It turns in nine 40° steps driven by the shared
 * spinner clock instead of a CSS animation: a running CSS animation keeps the
 * renderer drawing a frame on every vsync, which is costly on Windows.
 */
export function InlineSpinner(props: InlineSpinnerProps) {
  const [local, rest] = splitProps(props, ['class', 'style']);
  const angle = createSpinnerAngle(9);
  return (
    <span
      {...rest}
      class={local.class ? `inline-spinner ${local.class}` : 'inline-spinner'}
      style={{ ...local.style, transform: `rotate(${angle()}deg)` }}
    />
  );
}
