// SPDX-License-Identifier: MPL-2.0
// The decision behind generate.mjs's chain to the root tree's own generator, pulled out as a pure
// function so it can be unit-tested (tools/console/test/run.mjs) without shelling out to git or
// touching the filesystem. generate.mjs does the IO (git rev-parse, existsSync) and hands the
// results here.
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * @param {string} repoPath the tree this generator run started from
 * @param {string} commonDir the absolute `--git-common-dir` for this tree, or '' if git failed
 * @param {boolean} noChainEnv true when VERSTAAN_CONSOLE_NO_CHAIN is set (stop the chain here)
 * @param {boolean} rootGenExists true when the root tree's generate.mjs is on disk
 * @returns {{chain: boolean, rootTree: string|null, rootGen: string|null}}
 */
export function chainDecision(repoPath, commonDir, noChainEnv, rootGenExists) {
  const rootTree = commonDir ? dirname(commonDir) : null;
  const rootGen = rootTree ? join(rootTree, 'tools', 'console', 'src', 'generate.mjs') : null;
  const chain = !noChainEnv && !!rootTree && resolve(rootTree) !== resolve(repoPath) && !!rootGenExists;
  return { chain, rootTree, rootGen };
}

/** generate.mjs's only call into the chain: decide, then run. `existsSync` (to build the
 * decision) and `spawnSync` (to act on it) both read `decision.rootGen`, the one value
 * `chainDecision` computed — never two independently-built paths, which is exactly how issue 92's
 * root-detection bug happened and how checkpoint 4 found it again here (generate.mjs used to guess
 * the path twice, once to check it existed and once to run it). `existsSyncFn`/`spawnSyncFn`/`env`
 * are injectable so this whole wiring line is testable without touching disk or spawning a real
 * process, not just the pure decision inside it. */
export function runChain(repoPath, commonDir, noChainEnv, {
  existsSyncFn = existsSync,
  spawnSyncFn = spawnSync,
  env = process.env,
  log = console.log,
  logError = console.error,
} = {}) {
  const guessRootTree = commonDir ? dirname(commonDir) : null;
  const guessRootGen = guessRootTree ? join(guessRootTree, 'tools', 'console', 'src', 'generate.mjs') : null;
  const decision = chainDecision(repoPath, commonDir, noChainEnv, guessRootGen ? existsSyncFn(guessRootGen) : false);
  if (!decision.chain) return decision;
  // 15 s: the budget the Stop hook that usually triggers this generator run allows itself. `git`
  // waiting on `index.lock` during a rebase in the root tree must not hang this run past that
  // budget; a timeout is treated the same as the non-zero exit below (checkpoint 4).
  const r = spawnSyncFn(process.execPath, [decision.rootGen], { cwd: decision.rootTree, env: { ...env, VERSTAAN_CONSOLE_NO_CHAIN: '1' }, encoding: 'utf8', timeout: 15000 });
  if (r.status === 0) log(`console: root console at ${decision.rootTree} refreshed too`);
  else if (r.error && r.error.code === 'ETIMEDOUT') logError(`console: root refresh at ${decision.rootTree} timed out after 15 s`);
  else logError(`console: root refresh failed: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ')}`);
  return decision;
}
