/** Absolute on POSIX (`/…`), Windows (`C:\…`, `C:/…`), or UNC (`\\…`). */
export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

export function abbreviateHomePath(input: string): string {
  // Normalize so backslash (`C:\Users\me\…`) and forward-slash homes share
  // one matcher; the caller's separator style is restored on the way out.
  const normalized = input.replace(/\\/g, '/');
  const match = normalized.match(
    /^(?:\/home\/[^/]+|\/Users\/[^/]+|[A-Za-z]:\/Users\/[^/]+)(\/.*)?$/,
  );
  if (!match) return input;
  const rest = match[1] ?? '';
  if (rest === '' || rest === '/') return '~';
  return input.includes('\\') ? `~${rest.replace(/\//g, '\\')}` : `~${rest}`;
}

/** Last path segment, splitting on both `/` and `\` so Windows paths work; trailing separators are ignored. */
export function pathBasename(p: string): string {
  return (
    p
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? ''
  );
}

/** Program name of a command (`C:\…\claude.cmd` → `claude`), dropping Windows launcher suffixes. */
export function commandName(command: string): string {
  return pathBasename(command).replace(/\.(cmd|exe|bat|com)$/i, '');
}
