// SPDX-License-Identifier: MPL-2.0
// The allow-list (issue 100 "Shape"): a typed table, one entry per job kind the console may run.
// A kind maps to a fixed command template. `args` are validated per kind before a process is ever
// spawned. Nothing here builds a shell string from client input: every argument that reaches
// `spawn` is either a literal from this table or a value that passed its kind's own validator, so
// there is no way for a request body to smuggle in an extra flag or a second command (the ADR
// under docs/adr/ names this the rule).
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type Stream = 'stdout' | 'stderr';

/** Every argument a spawned job needs: the literal argv, the working directory, optional stdin,
 * and an optional extra environment (only `mirror`/`mirror-check` ever set one, and only
 * `GH_TOKEN`, read fresh at job start -- see `runner.ts`). */
export interface Spawn {
  cmd: string;
  args: string[];
  cwd: string;
  input?: string;
  needsGhToken?: boolean;
}

/** Returns a reason string when the job must not even start (e.g. `gate` in a tree with no
 * `CMakeUserPresets.json`), or null when it is clear to run. Runs before any process spawns. */
export type Precheck = (treeAbsPath: string) => string | null;

export interface JobKindDef {
  kind: string;
  label: string;
  /** True when this kind acts on one worktree (`tree` is required in the request). Kinds that
   * are not tree-scoped (`worktree-list`) always run at the repo root. */
  treeScoped: boolean;
  /** Validates the request's `args` object, returning a normalised copy or throwing a
   * `JobArgsError` naming what is wrong. Kinds that take no args ignore the input entirely. */
  validateArgs: (args: unknown) => Record<string, unknown>;
  precheck?: Precheck;
  build: (treeAbsPath: string, args: Record<string, unknown>) => Spawn;
}

export class JobArgsError extends Error {}

function noArgs(): Record<string, unknown> {
  return {};
}

function requireString(args: unknown, key: string): string {
  const v = (args as Record<string, unknown> | null | undefined)?.[key];
  if (typeof v !== 'string' || v.length === 0) throw new JobArgsError(`${key} must be a non-empty string`);
  return v;
}

// ctest labels this repo actually uses (SPEC.md §5 / docs/standards/testing.md). Not an
// open-ended string: a label the console cannot see in either doc is not one it will run.
const CTEST_LABELS = ['fast', 'golden', 'equivalence', 'tier'];

// pytest may only be pointed at a path under tools/, and never outside it (no `..`, no absolute
// path) -- the same boundary the Stop hook's own pytest branch already respects.
function validatePytestPath(p: string): string {
  if (p.includes('..') || p.startsWith('/') || !/^tools\/[A-Za-z0-9_./-]+$/.test(p)) {
    throw new JobArgsError('path must be a tools/ subpath with no ".."');
  }
  return p;
}

function pickCmakePreset(kind: 'debug' | 'tidy' = 'debug'): string {
  if (process.platform === 'win32') return kind === 'tidy' ? 'clang-release' : 'msvc-debug';
  return kind === 'tidy' ? 'linux-clang' : 'linux-gcc';
}

function gatePrecheck(treeAbsPath: string): string | null {
  // CMakePresets.json is tracked and always present; checking for it as a fallback made this
  // precheck a no-op (`A || B` where B is always true). The presets this job actually selects
  // (`pickCmakePreset`: linux-gcc/linux-clang on Linux and macOS) live only in the gitignored
  // CMakeUserPresets.json ("Linux gate presets" -- docs/factory/issues/100), so on those
  // platforms that file specifically, not either file, is what must exist. Windows keeps using
  // the tracked MSVC presets, so nothing extra is required there.
  if (process.platform !== 'win32' && !existsSync(join(treeAbsPath, 'CMakeUserPresets.json'))) {
    return 'gate: CMakeUserPresets.json is missing in this tree; copy the gitignored file in (it carries the linux-gcc/linux-clang presets) before gating.';
  }
  if (!existsSync(join(treeAbsPath, 'CMakePresets.json'))) {
    return 'gate: CMakePresets.json is missing in this tree.';
  }
  return null;
}

export const JOB_KINDS: Record<string, JobKindDef> = {
  'gate-fast': {
    kind: 'gate-fast',
    label: 'Fast gate (Stop hook)',
    treeScoped: true,
    validateArgs: noArgs,
    build: (tree) => ({ cmd: 'bash', args: ['.claude/hooks/gate-fast.sh'], cwd: tree, input: '{}' }),
  },
  gate: {
    kind: 'gate',
    label: 'Full gate (writes the stamp)',
    treeScoped: true,
    validateArgs: noArgs,
    precheck: gatePrecheck,
    build: (tree) => ({ cmd: 'bash', args: ['tools/factory/hooks/gate_full.sh'], cwd: tree }),
  },
  ctest: {
    kind: 'ctest',
    label: 'ctest --label',
    treeScoped: true,
    validateArgs: (args) => {
      const label = requireString(args, 'label');
      if (!CTEST_LABELS.includes(label)) throw new JobArgsError(`label must be one of ${CTEST_LABELS.join(', ')}`);
      return { label };
    },
    build: (tree, args) => ({
      cmd: 'ctest',
      args: ['--preset', pickCmakePreset(), '-L', String(args.label), '--output-on-failure'],
      cwd: tree,
    }),
  },
  pytest: {
    kind: 'pytest',
    label: 'pytest <path>',
    treeScoped: true,
    validateArgs: (args) => ({ path: validatePytestPath(requireString(args, 'path')) }),
    build: (tree, args) => ({ cmd: 'python', args: ['-m', 'pytest', String(args.path), '-q'], cwd: tree }),
  },
  'console-tests': {
    kind: 'console-tests',
    label: 'Console app tests (npm test)',
    treeScoped: true,
    validateArgs: noArgs,
    build: (tree) => ({ cmd: 'npm', args: ['test'], cwd: join(tree, 'apps', 'console') }),
  },
  validate: {
    kind: 'validate',
    label: 'tools.validate --all',
    treeScoped: true,
    validateArgs: noArgs,
    build: (tree) => ({ cmd: 'python', args: ['-m', 'tools.validate', '--all'], cwd: tree }),
  },
  'mirror-check': {
    kind: 'mirror-check',
    label: 'mirror --check',
    treeScoped: true,
    validateArgs: noArgs,
    build: (tree) => ({ cmd: 'python', args: ['-m', 'tools.factory.mirror_github', '--check'], cwd: tree, needsGhToken: true }),
  },
  mirror: {
    kind: 'mirror',
    label: 'mirror (sync to GitHub)',
    treeScoped: true,
    validateArgs: noArgs,
    build: (tree) => ({ cmd: 'python', args: ['-m', 'tools.factory.mirror_github'], cwd: tree, needsGhToken: true }),
  },
  'service-start': {
    kind: 'service-start',
    label: 'service start',
    treeScoped: true,
    validateArgs: (args) => ({ name: requireString(args, 'name') }),
    build: (tree, args) => {
      throw new Error(`service-start: no local service named '${String(args.name)}' is registered`);
    },
  },
  'service-stop': {
    kind: 'service-stop',
    label: 'service stop',
    treeScoped: true,
    validateArgs: (args) => ({ name: requireString(args, 'name') }),
    build: (tree, args) => {
      throw new Error(`service-stop: no local service named '${String(args.name)}' is registered`);
    },
  },
  'worktree-list': {
    kind: 'worktree-list',
    label: 'worktree list',
    treeScoped: false,
    validateArgs: noArgs,
    build: (tree) => ({ cmd: 'git', args: ['worktree', 'list'], cwd: tree }),
  },
};

export const ALLOWED_KINDS = Object.keys(JOB_KINDS);

/** True when a service name is the console itself, by name or by the console's own port. Checked
 * before any other validation, in the route handler, so it is refused whatever else the body
 * carries (issue 100 acceptance: "whatever the body carries"). */
export function namesConsole(name: string, port: number): boolean {
  const n = name.trim().toLowerCase();
  return n === 'console' || n === `console:${port}` || n === String(port);
}
