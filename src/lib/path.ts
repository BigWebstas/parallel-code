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
