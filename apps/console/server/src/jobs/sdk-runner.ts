// SPDX-License-Identifier: MPL-2.0
// The harness (issue 178, ADR 0016): opens one Agent SDK session for a `quest-run` job with the
// same prompt, model and effort the boarding pass (`quest-start`, issue 174) composes. Every tool
// call passes through `canUseTool`; `AskUserQuestion` is the one interception point ADR 0016
// names -- every other tool is auto-approved, unaltered, so the harness runs the same agents the
// terminal runs and gains no new member. This is the second spawn site in the codebase besides
// `runner.ts`'s `child_process.spawn`, and the only one that opens a model session instead of a
// process that ends (`kinds.ts`'s own `sdkSession` flag is what tells `JobManager.start()` to
// come here instead).
import { query, type Options, type Query } from '@anthropic-ai/claude-agent-sdk';

/** The one shape `JobManager` needs back from a session, independent of the real SDK's own
 * message union -- kept narrow on purpose so a test can stub `queryFn` with a handful of plain
 * objects instead of the SDK's full type surface ("Not in scope": no real SDK network call in
 * tests). */
export interface SdkSessionCallbacks {
  /** A line for the job log -- 'meta' for anything this runner itself narrates (the question
   * asked, the answer received, the cost line), 'stdout' for the session's own assistant text. */
  onLine: (stream: 'stdout' | 'meta', text: string) => void;
  /** Called at most once per real session id the SDK reports; `JobManager` writes it onto the job
   * record so a rebuilt server can find this session again (issue 178 acceptance). */
  onSessionId: (sessionId: string) => void;
  /** Called once per `AskUserQuestion` tool call. Resolves with the owner's free-text answer,
   * posted back through the Jobs-room answer endpoint -- `runQuestSession` blocks on this exactly
   * as long as `JobManager` takes to receive that POST; there is no timeout here, matching a real
   * interactive checkpoint, which also waits until someone answers. Checkpoint-4 review, finding
   * 1: also resolves (with a sentinel, never left hanging) when `JobManager.kill()` interrupts the
   * job while a question is open. */
  onQuestion: (toolUseId: string, input: Record<string, unknown>) => Promise<string>;
}

export interface QuestRunParams {
  /** The same `/factory-run NN` line `quest-start`'s `questStartArgv` composes (kinds.ts). */
  prompt: string;
  model: string;
  effort: string;
  cwd: string;
  /** Set only when resuming a session that already has an id (restart-gate.ts, issue 178
   * acceptance: "resumes via query({ resume: sessionId, ... })"). */
  resume?: string;
}

/** What `runQuestSession` (and any stub standing in for it in a test) hands back to `JobManager`.
 * Checkpoint-4 review, finding 1: unlike a spawned `child_process`, an Agent SDK session has no
 * OS-level handle `kill(id)` can act on -- `interrupt` is the one the SDK's own `Query` object
 * exposes, and `JobManager.kill()` (runner.ts) holds it per job id, parallel to how it already
 * holds a `ChildProcess` per spawned job. `done` resolves the same way a spawned child's own exit
 * code would: `0` success, `1` otherwise, including after a call to `interrupt()`. */
export interface QuestSessionHandle {
  done: Promise<number>;
  /** Interrupts the session. Safe to call more than once (the second call is a no-op); resolves
   * once the SDK acknowledges or the session has already ended, whichever comes first. Never
   * rejects -- a kill request must never fail loudly over a control-channel hiccup. */
  interrupt: () => Promise<void>;
}

/** Injectable seam: `JobManager`'s constructor takes this as `sdkRunnerFn`, defaulting to
 * `runQuestSession` in production. A test supplies a fake with the same signature, driven by a
 * stub async generator instead of a real `query()` call. */
export type SdkRunnerFn = (params: QuestRunParams, callbacks: SdkSessionCallbacks) => QuestSessionHandle;

export type QueryFn = typeof query;

/** True when a `PermissionResult` (sdk.d.ts) has no field to carry free text other than a
 * `deny`'s own `message` -- there is no "answer" field on `allow`. Denying the tool call with the
 * owner's text is how the answer travels back to the model as this tool call's own result (ADR
 * 0016: "returns the answer as the tool result"): the model reads the denial message as the
 * answer and continues, the same shape a real interactive `AskUserQuestion` prompt already has (a
 * decline that carries a reason the model must act on, not a hard stop). */
function answerAsPermissionResult(answer: string): { behavior: 'deny'; message: string } {
  return { behavior: 'deny', message: answer };
}

/** The sentinel `JobManager.kill()` resolves an open question's promise with (runner.ts,
 * checkpoint-4 review finding 1): a killed session still needs `canUseTool`'s own `await` to
 * settle, or that promise -- and the `for await` loop driving the whole session -- never
 * completes; `interrupt()` alone does not reach into a callback this module already handed off
 * to the SDK's own control-channel wait. */
export const KILLED_SENTINEL = '(job was killed before this question was answered)';

/** True for a `type: 'assistant'` frame (checkpoint-4 review, finding 3): its own text lives at
 * `message.message.content[].type === 'text'`, not at a top-level `text` field -- no member of
 * the real SDK's `SDKMessage` union carries one. Narrow, defensive reads throughout: a shape this
 * function does not recognise yields no lines rather than throwing, since a message type this
 * runner has never seen is not a reason to crash the whole session. */
function assistantText(message: Record<string, unknown>): string[] {
  const inner = message.message as { content?: unknown } | undefined;
  const content = inner?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block): block is { type: string; text: string } => !!block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string')
    .map((block) => block.text);
}

/** Runs one quest as an Agent SDK session. Starts the session synchronously (so its `interrupt`
 * is available to the caller immediately, before the first message even arrives) and drives the
 * `for await` loop in the background; `done` resolves once that loop ends, exactly the way
 * `JobManager.start()`'s spawned-process path resolves from a child's own `close` event, not from
 * this call's own stack. `queryFn` defaults to the real SDK's `query()`; tests inject a stub that
 * yields plain message objects instead. */
export function runQuestSession(params: QuestRunParams, callbacks: SdkSessionCallbacks, queryFn: QueryFn = query): QuestSessionHandle {
  let interrupted = false;
  const options: Options = {
    model: params.model,
    // Options.effort (sdk.d.ts): the same low/medium/high scale the issue's own front matter
    // names, validated against this repo's real values in kinds.ts's QUEST_EFFORTS before this
    // function is ever called.
    effort: params.effort as Options['effort'],
    cwd: params.cwd,
    resume: params.resume,
    canUseTool: async (toolName, input, toolOptions) => {
      if (toolName !== 'AskUserQuestion') {
        // Every other tool call passes through unaltered: the harness runs the same `/factory-run`
        // and the same agents the terminal runs (ADR 0016, "the party gains no new member"), so
        // nothing here second-guesses a decision the terminal session already makes for itself.
        return { behavior: 'allow' };
      }
      callbacks.onLine('meta', `question: ${JSON.stringify(input)}`);
      const answer = await callbacks.onQuestion(toolOptions.toolUseID, input);
      callbacks.onLine('meta', `answer: ${answer}`);
      return answerAsPermissionResult(answer);
    },
  };

  const stream = queryFn({ prompt: params.prompt, options }) as Query | AsyncIterable<Record<string, unknown>>;

  const done = (async (): Promise<number> => {
    let exitCode = 0;
    let sessionAnnounced = false;
    try {
      for await (const raw of stream as AsyncIterable<Record<string, unknown>>) {
        const message = raw as Record<string, unknown>;
        if (!sessionAnnounced && typeof message.session_id === 'string') {
          sessionAnnounced = true;
          callbacks.onSessionId(message.session_id);
        }
        if (message.type === 'result') {
          const cost = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : null;
          // The owner's "same plan as terminal" claim (ADR 0016, unverified per the handoff): the
          // session's own cost line, printed once, in the open, not swallowed.
          callbacks.onLine('meta', cost != null ? `cost: $${cost.toFixed(4)} total_cost_usd` : `result: ${String(message.subtype ?? 'unknown')}`);
          exitCode = message.subtype === 'success' && message.is_error !== true ? 0 : 1;
        } else if (message.type === 'assistant') {
          // Checkpoint-4 review, finding 3: a real assistant frame's text lives nested inside
          // `message.message.content`, never at a top level the earlier `typeof message.text ===
          // 'string'` check could ever match against the real SDK's own message union.
          for (const text of assistantText(message)) callbacks.onLine('stdout', text);
        }
      }
    } catch (e) {
      if (interrupted) {
        callbacks.onLine('meta', 'quest-run: session interrupted (killed)');
        return 1;
      }
      callbacks.onLine('meta', `quest-run: session error: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
    return interrupted ? 1 : exitCode;
  })();

  const interrupt = async (): Promise<void> => {
    if (interrupted) return;
    interrupted = true;
    try {
      await (stream as Query).interrupt?.();
    } catch {
      // Best-effort: the control channel may already be gone (the session ended on its own a
      // moment before the kill request landed) -- `done` above still resolves either way.
    }
  };

  return { done, interrupt };
}
