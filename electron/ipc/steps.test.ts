import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseStepsContent,
  startStepsWatcher,
  stopAllStepsWatchers,
  stopStepsWatchersForPath,
} from './steps.js';

describe('parseStepsContent', () => {
  it('preserves the canonical JSON array format', () => {
    const raw = JSON.stringify([
      { summary: 'Inspecting the repo', status: 'investigating' },
      { summary: 'Running tests', status: 'testing' },
    ]);

    expect(parseStepsContent(raw)).toEqual([
      { summary: 'Inspecting the repo', status: 'investigating' },
      { summary: 'Running tests', status: 'testing' },
    ]);
  });

  it('accepts a single step object before a second line is appended', () => {
    expect(parseStepsContent('{"summary":"Inspecting the repo","status":"investigating"}')).toEqual(
      [{ summary: 'Inspecting the repo', status: 'investigating' }],
    );
  });

  it('parses newline-delimited step objects written by append-oriented agents', () => {
    const raw = [
      '{"summary":"Inspecting the repo","status":"investigating"}',
      '{"summary":"Running tests","status":"testing","files_touched":[]}',
    ].join('\n');

    expect(parseStepsContent(raw)).toEqual([
      { summary: 'Inspecting the repo', status: 'investigating' },
      { summary: 'Running tests', status: 'testing', files_touched: [] },
    ]);
  });

  it('rejects malformed or non-object JSONL entries', () => {
    expect(
      parseStepsContent('{"summary":"Inspecting the repo","status":"investigating"}\nnot-json'),
    ).toBeNull();
    expect(
      parseStepsContent('{"summary":"Inspecting the repo","status":"investigating"}\n42'),
    ).toBeNull();
  });
});

describe('stopStepsWatchersForPath', () => {
  let worktreePath: string;

  beforeEach(() => {
    worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-test-'));
  });

  afterEach(() => {
    stopAllStepsWatchers();
    fs.rmSync(worktreePath, { recursive: true, force: true });
  });

  it('stops watchers matching the worktree path', async () => {
    const notify = vi.fn();
    startStepsWatcher(notify, 'task-steps-stop', worktreePath);
    stopStepsWatchersForPath(worktreePath);

    const stepsDir = path.join(worktreePath, '.claude');
    fs.mkdirSync(stepsDir, { recursive: true });
    fs.writeFileSync(path.join(stepsDir, 'steps.json'), JSON.stringify([{ summary: 'test' }]));

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(notify).not.toHaveBeenCalled();
  });
});
