/**
 * Git exports `GIT_DIR`, `GIT_INDEX_FILE` and friends into the environment of
 * every hook it runs. `npm test` from `.husky/pre-push` therefore hands those
 * to each vitest worker, and any `git` a test spawns inherits them — so tests
 * that build a repository in a temp folder silently operate on the developer's
 * real checkout instead, committing fixtures onto their branch and clobbering
 * their index. Scrubbing them here keeps the suite hermetic whatever invoked it.
 */
const REPO_POINTING_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_QUARANTINE_PATH',
  'GIT_CEILING_DIRECTORIES',
] as const;

for (const name of REPO_POINTING_VARS) Reflect.deleteProperty(process.env, name);

/**
 * A developer's global `core.autocrlf=true` (the Git for Windows default) turns
 * every file a test writes into CRLF once git touches it, so exact-content
 * assertions fail on that machine only. CI pins it to false; do the same here.
 * Environment config yields to a repository's own settings, so tests that set
 * autocrlf themselves keep working.
 */
if (!process.env.GIT_CONFIG_COUNT) {
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = 'core.autocrlf';
  process.env.GIT_CONFIG_VALUE_0 = 'false';
}
