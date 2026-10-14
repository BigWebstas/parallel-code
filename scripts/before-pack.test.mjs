import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const { findPackProblems } = createRequire(import.meta.url)('./before-pack.cjs');

const roots = [];

function project(dependencies, packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-before-pack-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
  for (const [name, manifest] of Object.entries(packages)) {
    const dir = path.join(root, 'node_modules', ...name.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }));
  }
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('findPackProblems', () => {
  it('accepts a complete install, including nested and scoped packages', () => {
    const root = project(
      { 'web-push': '1', '@scope/a': '1' },
      {
        'web-push': { dependencies: { 'asn1.js': '1' } },
        'asn1.js': { dependencies: { 'bn.js': '1' } },
        'bn.js': {},
        '@scope/a': {},
      },
    );
    expect(findPackProblems(root)).toEqual([]);
  });

  it('names a transitive dependency that is not installed', () => {
    const root = project(
      { 'web-push': '1' },
      {
        'web-push': { dependencies: { 'asn1.js': '1' } },
        'asn1.js': { dependencies: { 'bn.js': '1' } },
      },
    );
    expect(findPackProblems(root)).toEqual([expect.stringContaining('Not installed: bn.js')]);
  });

  it('ignores missing optional dependencies', () => {
    const root = project({ sdk: '1' }, { sdk: { optionalDependencies: { 'sdk-linux-x64': '1' } } });
    expect(findPackProblems(root)).toEqual([]);
  });

  it('flags symlinked packages that electron-builder would skip', () => {
    const root = project({ real: '1' }, { real: {} });
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-before-pack-src-'));
    roots.push(elsewhere);
    fs.writeFileSync(path.join(elsewhere, 'package.json'), '{"name":"linked"}');
    fs.symlinkSync(elsewhere, path.join(root, 'node_modules', 'linked'), 'junction');
    expect(findPackProblems(root)).toEqual([
      expect.stringContaining('1 symlink(s)/junction(s) (linked)'),
    ]);
  });

  it('reports a project with no node_modules', () => {
    const root = project({}, {});
    fs.rmSync(path.join(root, 'node_modules'), { recursive: true });
    expect(findPackProblems(root)).toEqual([expect.stringContaining('does not exist')]);
  });
});
