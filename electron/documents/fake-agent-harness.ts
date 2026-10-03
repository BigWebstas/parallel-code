import fs from 'fs';
import path from 'path';

// Every fake can read files, run git and print headless-agent events.
const PRELUDE = [
  "import fs from 'node:fs';",
  "import { execFileSync } from 'node:child_process';",
  "const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');",
  'const edit = (file, ...pairs) => {',
  "  let text = fs.readFileSync(file, 'utf8');",
  '  for (const [from, to] of pairs) text = text.replace(from, to);',
  '  fs.writeFileSync(file, text);',
  '};',
].join('\n');

/**
 * Writes a fake agent CLI for tests and returns the command to configure. The
 * fake is a Node.js script, so one fake runs on every platform: POSIX starts it
 * through its shebang, and Windows gets an npm-style `.cmd` shim around it, so
 * the launch resolves the shim exactly as it does for an npm-installed agent.
 * The script sees its arguments in `process.argv.slice(2)`.
 */
export function writeFakeAgent(dir: string, name: string, source: string): string {
  const script = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(script, `#!/usr/bin/env node\n${PRELUDE}\n${source}\n`, { mode: 0o755 });
  if (process.platform !== 'win32') return script;
  const shim = path.join(dir, `${name}.cmd`);
  fs.writeFileSync(shim, `@ECHO off\r\nnode "%~dp0\\${name}.mjs" %*\r\n`);
  return shim;
}
