// SPDX-License-Identifier: MPL-2.0
// The allow-list (issue 100 "Shape"): a typed table, one entry per job kind the console may run.
// A kind maps to a fixed command template. `args` are validated per kind before a process is ever
// spawned. Nothing here builds a shell string from client input: every argument that reaches
// `spawn` is either a literal from this table or a value that passed its kind's own validator, so
// there is no way for a request body to smuggle in an extra flag or a second command (the ADR
// under docs/adr/ names this the rule).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk';
import { REPO } from '../model/read.js';
import { parseFrontmatter } from '../model/parse.js';

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
  /** Issue 178 (ADR 0016): true for exactly one row, `quest-run`. `JobManager.start()` branches
   * on this before it ever calls `build`/`spawn` -- this kind opens an Agent SDK session
   * (`query()`), the second spawn site in the codebase, and never a child process that ends. Its
   * own `build` is never called; it exists only so the table's own shape (every kind owns a
   * `build`) stays uniform and a stray call fails loudly instead of silently doing nothing. */
  sdkSession?: boolean;
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

// The three models a quest's front matter may name. Pinned to `docs/factory/loadouts.json` by a
// server test (issue 189); the validator reads the same file.
// An allowlist, not a blocklist (ADR 0011): a quest naming a model this list has not caught up
// with is a data problem to fix in the issue file or here, never a string to let through unchecked
// into an argv slot that opens a real terminal.
export const QUEST_MODELS = ['haiku', 'sonnet', 'opus'];

// Issue 191 (ADR 0016 amendment, flight plan D2): the model the console opens every `/factory-run`
// session at, whatever the quest's own `model:`. The session reads status, runs gates, commits and
// mirrors; none of that is design, so it does not need the quest's loadout. The quest's loadout
// goes to the first pass instead, through the prompt (`composeQuestPrompt`).
export const ORCHESTRATOR_MODEL = 'sonnet';
// The session's effort is fixed too: the SDK defaults to 'high', and an orchestrator's work does
// not need it. The quest's own effort goes to the first pass.
export const ORCHESTRATOR_EFFORT: EffortLevel = 'medium';

// One shape for an agent name wherever it enters a prompt line: `quest-start`'s args, a quest's
// front matter (`findQuestIssueFile`). Mirrored by the boarding pass in the client.
const AGENT_NAME = /^[a-z][a-z0-9-]*$/;

/** The quest's loadout for its first pass (issue 191): `agent` is optional because a quest file
 * may omit it; `model` and `effort` are always present by the time a quest is validated. */
export interface FirstPass {
  agent?: string;
  model: string;
  effort?: string;
}

/** The `/factory-run` prompt both boarding paths send (issue 191). One line: the command, then the
 * first pass's loadout as `key=value` pairs after a fixed `first pass:` marker, so a test (and the
 * skill) can read each value back out with one regex. Example:
 * `/factory-run 06 first pass: agent=implementer model=opus effort=high`. */
export function composeQuestPrompt(command: string, firstPass: FirstPass): string {
  const parts = [firstPass.agent ? `agent=${firstPass.agent}` : null, `model=${firstPass.model}`, firstPass.effort ? `effort=${firstPass.effort}` : null];
  return `${command} first pass: ${parts.filter(Boolean).join(' ')}`;
}

function validateQuestStartArgs(args: unknown): Record<string, unknown> {
  const model = requireString(args, 'model');
  if (!QUEST_MODELS.includes(model)) throw new JobArgsError(`model must be one of ${QUEST_MODELS.join(', ')}`);
  const optional = (args as Record<string, unknown> | null | undefined) ?? {};
  const out: Record<string, unknown> = { model };
  if (optional.effort !== undefined) {
    const effort = requireString(args, 'effort');
    if (!(QUEST_EFFORTS as readonly string[]).includes(effort)) throw new JobArgsError(`effort must be one of ${QUEST_EFFORTS.join(', ')}`);
    out.effort = effort;
  }
  if (optional.agent !== undefined) {
    const agent = requireString(args, 'agent');
    // An agent name becomes part of a prompt line, so it is held to the shape agent files use.
    if (!AGENT_NAME.test(agent)) throw new JobArgsError('agent must be a lowercase agent file name');
    out.agent = agent;
  }
  const raw = (args as Record<string, unknown> | null | undefined)?.issue;
  const issue = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(issue) || issue <= 0) throw new JobArgsError('issue must be a positive integer');
  return { ...out, issue };
}

// The five `effort:` values `docs/factory/loadouts.json` lists (a server test pins this list to
// that file, issue 189) -- an allowlist, the same reasoning as QUEST_MODELS above: a quest
// naming an effort this list has not caught up with is a data problem to fix in the issue file or
// here, never a string put unchecked into a prompt line (`composeQuestPrompt`) that the session
// reads. Typed as `readonly EffortLevel[]`, the SDK's own scale (sdk.d.ts), so a value the SDK
// cannot accept is a compile error here. `ORCHESTRATOR_EFFORT` is a member of this scale too.
export const QUEST_EFFORTS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The one issue file (issue 178, ADR 0016) a `quest-run` request names, read fresh from disk --
 * never the cached, already-parsed `Issue` the rest of the app builds from `readRepo()`, because
 * `quest-run`'s own validator must see the file as it is the instant a job is requested, not as it
 * was the last time `/api/state` rebuilt its cache. `issuesDir` is a parameter (defaulting to this
 * checkout's real `docs/factory/issues`) so a test can point it at a throwaway fixture, the same
 * seam `lessonSigPresent` (below) already uses for its own ledger file. Returns null when no file
 * in the directory starts with `<issue>-` (zero-padded or not -- every issue file below 10 is
 * zero-padded on disk, `01-...md`, checkpoint-4 review finding 7) or the file carries no
 * parseable front matter at all; `validateQuestRunArgs` turns that into the 400 a request must
 * get before any session opens. */
export function findQuestIssueFile(
  issue: number,
  issuesDir: string = join(REPO, 'docs', 'factory', 'issues'),
): { file: string; agent: string; model: string; effort: string; status: string } | null {
  if (!existsSync(issuesDir)) return null;
  for (const name of readdirSync(issuesDir)) {
    if (!new RegExp(`^0*${issue}-.*\\.md$`).test(name) || /-test-cases\.md$/.test(name)) continue;
    const content = readFileSync(join(issuesDir, name), 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) return null;
    return {
      file: name,
      agent: typeof fm.agent === 'string' ? fm.agent : Array.isArray(fm.agent) ? '[list]' : '',
      model: typeof fm.model === 'string' ? fm.model : '',
      effort: typeof fm.effort === 'string' ? fm.effort : '',
      status: typeof fm.status === 'string' ? fm.status : '',
    };
  }
  return null;
}

/** Refuses (before any Agent SDK session ever opens) unless the quest number names a real issue
 * file, that file's own `status:` is `open` (a quest already running or already landed is not one
 * `quest-run` may start a second time), and its `model:`/`effort:` are both values this table
 * already knows (issue 178 acceptance: "checking the quest number resolves to an open issue file
 * with a model and effort in front matter"). Unlike `quest-start`, the model and effort are never
 * taken from the client's own request body -- they come only from the issue file itself, read
 * here, so a request cannot ask the harness to run one quest under another quest's loadout. */
export function validateQuestRunArgs(args: unknown, issuesDir?: string): Record<string, unknown> {
  const raw = (args as Record<string, unknown> | null | undefined)?.issue;
  const issue = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(issue) || issue <= 0) throw new JobArgsError('issue must be a positive integer');
  const found = findQuestIssueFile(issue, issuesDir);
  if (!found) throw new JobArgsError(`issue ${issue}: no issue file found under docs/factory/issues`);
  if (found.status !== 'open') throw new JobArgsError(`issue ${issue}: front matter status is '${found.status || '(none)'}', not 'open'`);
  if (!QUEST_MODELS.includes(found.model)) throw new JobArgsError(`issue ${issue}: front matter model '${found.model || '(none)'}' is not one of ${QUEST_MODELS.join(', ')}`);
  // `found.effort` is a plain `string` (front matter is untyped text); the cast here is only ever
  // used for this one membership check, never to smuggle an unchecked value past it -- the `if`
  // itself is what proves `found.effort` really is one of `QUEST_EFFORTS`'s own `EffortLevel`
  // values before anything downstream ever treats it as one (checkpoint-4 review, finding 4).
  if (!(QUEST_EFFORTS as readonly string[]).includes(found.effort)) {
    throw new JobArgsError(`issue ${issue}: front matter effort '${found.effort || '(none)'}' is not one of ${QUEST_EFFORTS.join(', ')}`);
  }
  // The agent name lands in the prompt line, so it is held to the same shape as `quest-start`'s.
  // A quest with no `agent:` at all is allowed (empty); a list or a malformed name is refused.
  if (found.agent !== '' && !AGENT_NAME.test(found.agent)) {
    throw new JobArgsError(`issue ${issue}: front matter agent '${found.agent}' is not a lowercase agent file name`);
  }
  return { issue, agent: found.agent, model: found.model, effort: found.effort, file: found.file };
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
 * standard alternative for "the user's chosen terminal emulator". The session model is always
 * `ORCHESTRATOR_MODEL` (issue 191); the quest's own model rides inside `questLine`. */
export function questStartArgv(platform: NodeJS.Platform, questLine: string): { cmd: string; args: string[] } {
  if (platform === 'win32') {
    return { cmd: 'cmd', args: ['/c', 'start', 'Verstaan quest', 'claude', '--model', ORCHESTRATOR_MODEL, questLine] };
  }
  return { cmd: 'x-terminal-emulator', args: ['-e', 'claude', '--model', ORCHESTRATOR_MODEL, questLine] };
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
      const issue = String(args.issue).padStart(2, '0');
      const questLine = composeQuestPrompt(`/factory-run ${issue}`, {
        agent: args.agent === undefined ? undefined : String(args.agent),
        model: String(args.model),
        effort: args.effort === undefined ? undefined : String(args.effort),
      });
      const { cmd, args: argv } = questStartArgv(process.platform, questLine);
      return { cmd, args: argv, cwd: tree };
    },
  },
  'quest-run': {
    kind: 'quest-run',
    label: 'quest-run (Agent SDK session)',
    treeScoped: true,
    validateArgs: validateQuestRunArgs,
    sdkSession: true,
    build: () => {
      throw new Error('quest-run: runs an Agent SDK session, never a spawned process; JobManager.start() must branch on sdkSession before calling build()');
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
