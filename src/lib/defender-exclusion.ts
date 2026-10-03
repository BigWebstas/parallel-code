/**
 * PowerShell command that excludes folders from Microsoft Defender's real-time
 * scanning. Run it from an administrator PowerShell.
 */
export function defenderExclusionCommand(folders: readonly string[]): string {
  const unique = [...new Set(folders.filter((folder) => folder.trim() !== ''))];
  // Single quotes keep PowerShell from expanding `$` or backticks; a quote is doubled.
  const quoted = unique.map((folder) => `'${folder.replace(/'/g, "''")}'`).join(', ');
  return `Add-MpPreference -ExclusionPath ${quoted}`;
}
