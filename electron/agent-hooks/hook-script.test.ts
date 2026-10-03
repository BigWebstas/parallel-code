import { describe, expect, it } from 'vitest';
import { buildEndpointFile, buildHookScript, buildHookScriptCmd } from './hook-script.js';

describe('buildHookScript', () => {
  const script = buildHookScript();
  const lines = script.split('\n');

  it('answers Claude before doing anything that could fail', () => {
    const firstCommand = lines.find((line) => line.length > 0 && !line.startsWith('#'));
    expect(firstCommand).toBe("printf '{}\\n'");
  });

  it('drains stdin before any early exit so the agent never sees EPIPE', () => {
    const readIndex = lines.findIndex((line) => line.startsWith('payload=$('));
    const firstExit = lines.findIndex((line) => line.includes('exit 0'));
    expect(readIndex).toBeGreaterThan(-1);
    expect(firstExit).toBeGreaterThan(readIndex);
  });

  it('re-sources the endpoint file on every run and posts with the token header', () => {
    expect(script).toContain('. "$PARALLEL_CODE_HOOK_ENDPOINT"');
    expect(script).toContain('http://127.0.0.1:$PARALLEL_CODE_HOOK_PORT/hook/claude');
    expect(script).toContain('x-parallel-code-hook-token: $PARALLEL_CODE_HOOK_TOKEN');
    expect(script).toContain('x-parallel-code-agent-id: $PARALLEL_CODE_AGENT_ID');
    expect(script).toContain('x-parallel-code-launch-id: $PARALLEL_CODE_LAUNCH_ID');
  });

  it('stays quiet for background job workers that inherited the env', () => {
    expect(script).toContain('CLAUDE_JOB_DIR');
  });

  it('never fails the hook, even when curl does', () => {
    expect(script).toContain('|| :');
    expect(script.trimEnd().endsWith('exit 0')).toBe(true);
  });
});

describe('buildHookScriptCmd', () => {
  const script = buildHookScriptCmd();
  const lines = script.split('\r\n');

  it('uses CRLF line endings, which cmd.exe needs to find labels reliably', () => {
    expect(script.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('answers Claude first and never fails the hook', () => {
    expect(lines.slice(0, 5)).toContain('echo {}');
    expect(lines.filter((line) => line.startsWith('exit')).every((l) => l === 'exit /b 0')).toBe(
      true,
    );
  });

  it('consumes stdin on every early exit so the agent never sees EPIPE', () => {
    const drain = lines.indexOf(':drain');
    expect(lines[drain + 1]).toBe('findstr "^" >NUL 2>&1');
    const earlyExits = lines.filter(
      (line) => line.startsWith('if ') && !line.endsWith('goto drain'),
    );
    expect(earlyExits).toEqual([]);
  });

  it('reads the endpoint file on every run and posts with the token headers', () => {
    expect(script).toContain('in ("%PARALLEL_CODE_HOOK_ENDPOINT%")');
    expect(script).toContain('%SystemRoot%\\System32\\curl.exe');
    expect(script).toContain('http://127.0.0.1:%PC_PORT%/hook/claude');
    expect(script).toContain('x-parallel-code-hook-token: %PC_TOKEN%');
    expect(script).toContain('x-parallel-code-agent-id');
    expect(script).toContain('x-parallel-code-launch-id');
    expect(script).toContain('--data-binary @-');
  });

  it('stays quiet for background job workers that inherited the env', () => {
    expect(script).toContain('if defined CLAUDE_JOB_DIR goto drain');
  });
});

describe('buildEndpointFile', () => {
  it('is sourceable shell with one assignment per line', () => {
    expect(buildEndpointFile(4321, 'tok')).toBe(
      'PARALLEL_CODE_HOOK_PORT=4321\nPARALLEL_CODE_HOOK_TOKEN=tok\n',
    );
  });
});
