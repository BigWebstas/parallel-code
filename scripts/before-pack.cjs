// electron-builder beforePack hook: refuse to build an installer that would ship
// without its runtime dependencies.
//
// electron-builder does not follow symlinks or junctions inside node_modules, so
// a worktree whose node_modules is linked to another checkout packs without those
// packages (web-push and its asn1.js and bn.js were lost this way) and the
// installed app then fails at runtime. A dependency missing from node_modules
// does the same. Neither produces a build warning, so fail here instead.
const fs = require('fs');
const path = require('path');

/** Top-level node_modules entries (including scoped ones) that are links. */
function findLinkedEntries(nodeModules) {
  const linked = [];
  for (const entry of fs.readdirSync(nodeModules)) {
    if (entry === '.bin') continue; // npm's command shims are links on macOS and Linux
    const full = path.join(nodeModules, entry);
    if (fs.lstatSync(full).isSymbolicLink()) {
      linked.push(entry);
    } else if (entry.startsWith('@')) {
      for (const scoped of fs.readdirSync(full)) {
        if (fs.lstatSync(path.join(full, scoped)).isSymbolicLink())
          linked.push(`${entry}/${scoped}`);
      }
    }
  }
  return linked;
}

/** Directory of `name` as Node would resolve it from `fromDir`, or null. */
function resolvePackageDir(name, fromDir) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.dirname(dir) === dir) return null;
  }
}

/** Production dependencies, direct and transitive, that are not installed. */
function findMissingDependencies(projectDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
  const missing = [];
  const seen = new Set();
  const queue = Object.keys(manifest.dependencies ?? {}).map((name) => ({
    name,
    from: projectDir,
    optional: false,
  }));
  while (queue.length > 0) {
    const { name, from, optional } = queue.pop();
    const dir = resolvePackageDir(name, from);
    if (!dir) {
      if (!optional) missing.push(name);
      continue;
    }
    if (seen.has(dir)) continue;
    seen.add(dir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      queue.push({ name: dep, from: dir, optional: false });
    }
    // Platform-specific extras are legitimately absent on other platforms.
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
      queue.push({ name: dep, from: dir, optional: true });
    }
  }
  return [...new Set(missing)].sort();
}

/** Human-readable problems that would make the packed app incomplete; empty when fine. */
function findPackProblems(projectDir) {
  const nodeModules = path.join(projectDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) return [`${nodeModules} does not exist. Run npm install.`];
  const problems = [];
  const linked = findLinkedEntries(nodeModules);
  if (linked.length > 0) {
    problems.push(
      `node_modules contains ${linked.length} symlink(s)/junction(s) (${linked.slice(0, 5).join(', ')}` +
        `${linked.length > 5 ? ', ...' : ''}). electron-builder does not pack through links, so the ` +
        'installer would be missing those packages. Run npm install in this checkout to get real copies.',
    );
  }
  const missing = findMissingDependencies(projectDir);
  if (missing.length > 0) {
    problems.push(
      `Not installed: ${missing.join(', ')}. The installed app would fail when it loads them.`,
    );
  }
  return problems;
}

exports.default = async function beforePack(context) {
  const problems = findPackProblems(context.packager.projectDir);
  if (problems.length > 0) {
    throw new Error(`Refusing to pack an incomplete app:\n- ${problems.join('\n- ')}`);
  }
};
exports.findPackProblems = findPackProblems;
