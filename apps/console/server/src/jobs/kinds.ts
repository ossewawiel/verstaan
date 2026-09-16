// SPDX-License-Identifier: MPL-2.0
// The allow-list (issue 100 "Shape"): a typed table, one entry per job kind the console may run.
// A kind maps to a fixed command template. `args` are validated per kind before a process is ever
// spawned. Nothing here builds a shell string from client input: every argument that reaches
// `spawn` is either a literal from this table or a value that passed its kind's own validator, so
// there is no way for a request body to smuggle in an extra flag or a second command (the ADR
// under docs/adr/ names this the rule).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../model/read.js';

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

// The two models any quest's front matter ever names today (`grep -h '^model:' docs/factory/issues/*.md`).
// An allowlist, not a blocklist (ADR 0011): a quest naming a model this list has not caught up
// with is a data problem to fix in the issue file or here, never a string to let through unchecked
// into an argv slot that opens a real terminal.
const QUEST_MODELS = ['sonnet', 'opus'];

function validateQuestStartArgs(args: unknown): Record<string, unknown> {
  const model = requireString(args, 'model');
  if (!QUEST_MODELS.includes(model)) throw new JobArgsError(`model must be one of ${QUEST_MODELS.join(', ')}`);
  const raw = (args as Record<string, unknown> | null | undefined)?.issue;
  const issue = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(issue) || issue <= 0) throw new JobArgsError('issue must be a positive integer');
  return { model, issue };
}

/** The one argv template per platform (issue 174 L2): a real terminal, opened with the same line
 * the boarding pass copies already queued as its argv, never as a string handed to a shell.
 * `platform` is a parameter, not read from `process.platform` here, so both templates are provable
 * in one test run on one machine -- `build` (below) is the only caller that ever supplies the real
 * platform. Windows: `cmd /c start` opens a new console window running `claude` directly (`cmd`
 * itself is the one program `start` needs to hand the rest of argv to as its own arguments, not a
 * shell parsing them further). POSIX: `console.sh`/`console.cmd` open a browser tab, not a
 * terminal, so there is no existing terminal-launch convention to match here (checked, per the
 * issue's own instruction) -- `x-terminal-emulator -e` is Debian's (and so most desktop Linux's)
 * standard alternative for "the user's chosen terminal emulator". */
export function questStartArgv(platform: NodeJS.Platform, model: string, questLine: string): { cmd: string; args: string[] } {
  if (platform === 'win32') {
    return { cmd: 'cmd', args: ['/c', 'start', 'Verstaan quest', 'claude', '--model', model, questLine] };
  }
  return { cmd: 'x-terminal-emulator', args: ['-e', 'claude', '--model', model, questLine] };
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

// The same allowed shapes tools/factory/retro_promote.py enforces on its own write (issue 176,
// decision 2) -- checked again here, before a process is ever spawned, so a request this table
// cannot see coming never reaches even the precheck stage. Kept in sync by hand with
// retro_promote.py's own `_ALLOWED_TARGET_GLOBS`/`_ALLOWED_TARGET_EXACT`: two different runtimes
// (Node here, Python there), so neither can import the other's list.
const LESSON_PROMOTE_TARGET_GLOBS = [/^docs\/standards\/[^/]+\.md$/, /^docs\/adr\/[^/]+\.md$/, /^\.claude\/agents\/[^/]+\.md$/, /^\.claude\/skills\/[^/]+\/SKILL\.md$/];

export function lessonPromoteTargetAllowed(target: string): boolean {
  if (target.includes('..')) return false;
  if (target === 'CLAUDE.md') return true;
  return LESSON_PROMOTE_TARGET_GLOBS.some((re) => re.test(target));
}

/** True when `sig` is a signature the given `docs/factory/lessons.jsonl` text actually carries.
 * Takes the ledger's own file path so a test can point it at a throwaway fixture instead of this
 * checkout's real, ever-changing ledger; the real kind (`validateLessonPromoteArgs`, no second
 * argument) always reads the real one, fresh on every call, never cached. */
export function lessonSigPresent(sig: string, lessonsPath: string = join(REPO, 'docs', 'factory', 'lessons.jsonl')): boolean {
  if (!existsSync(lessonsPath)) return false;
  for (const line of readFileSync(lessonsPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      if (JSON.parse(line)?.sig === sig) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** Refuses (before any process spawns) unless: `target` is one of the allowed rule-file shapes,
 * `sig` is really in the ledger, `rule` is non-empty, and `approved` is literally `true` -- the
 * owner's explicit approval of the one group on screen, and the only thing that ever lets this
 * kind spawn a write (issue 176 acceptance: "writes nothing until the owner approves"). The target
 * shape is checked first: it needs no IO, so a bad target is refused the same way whatever `sig`
 * says, and a test can prove that refusal without depending on the real ledger's own content. */
export function validateLessonPromoteArgs(args: unknown, lessonsPath?: string): Record<string, unknown> {
  const sig = requireString(args, 'sig');
  const target = requireString(args, 'target');
  const rule = requireString(args, 'rule');
  if (!lessonPromoteTargetAllowed(target)) {
    throw new JobArgsError(`target '${target}' is not an allowed rule file (docs/standards/*.md, docs/adr/*.md, .claude/agents/*.md, .claude/skills/*/SKILL.md, CLAUDE.md)`);
  }
  if (!lessonSigPresent(sig, lessonsPath)) throw new JobArgsError(`sig '${sig}' is not in docs/factory/lessons.jsonl`);
  const approved = (args as Record<string, unknown> | null | undefined)?.approved;
  if (approved !== true) throw new JobArgsError('approved must be true; this kind never spawns without the owner\'s explicit approval');
  return { sig, target, rule, approved: true };
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
  'quest-start': {
    kind: 'quest-start',
    label: 'quest-start (open a terminal)',
    treeScoped: true,
    validateArgs: validateQuestStartArgs,
    build: (tree, args) => {
      const model = String(args.model);
      const issue = String(args.issue).padStart(2, '0');
      const { cmd, args: argv } = questStartArgv(process.platform, model, `/factory-run ${issue}`);
      return { cmd, args: argv, cwd: tree };
    },
  },
  'lesson-promote': {
    kind: 'lesson-promote',
    label: 'lesson-promote (/factory-retro)',
    treeScoped: true,
    validateArgs: validateLessonPromoteArgs,
    build: (tree, args) => ({
      cmd: 'python',
      args: ['-m', 'tools.factory.retro_promote', '--sig', String(args.sig), '--target', String(args.target), '--rule', String(args.rule)],
      cwd: tree,
    }),
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
