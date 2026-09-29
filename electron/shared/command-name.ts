/**
 * The bare program name of a launch command: `/usr/bin/claude`,
 * `C:\Users\me\.local\bin\claude.exe` and `claude` all give `claude`.
 * Splits rather than using `path.basename` so this stays free of Node imports
 * and the renderer can share it.
 */
export function commandName(command: string): string {
  const base = command.split(/[\\/]/).filter(Boolean).pop() ?? command;
  return base.replace(/\.(exe|cmd|bat)$/i, '');
}
