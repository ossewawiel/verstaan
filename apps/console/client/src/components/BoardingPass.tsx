// SPDX-License-Identifier: MPL-2.0
// The boarding pass (issue 174, L1): composes `claude --model sonnet "/factory-run NN first pass:
// ..."` from a quest's own front matter and copies it to the clipboard on click -- the same line the owner
// types into a terminal today (docs/factory/STATE.md), with nothing new that touches the process.
// It ships on the bridge (the next-quest card, ConsoleRoom.tsx) and the flight deck (a per-quest
// card, IssueCard.tsx): the same component, mounted twice, never two implementations of the line.
import { useEffect, useRef, useState } from 'react';

// Issue 191: the session always boards at Sonnet (the orchestrator); the quest's own model and
// effort ride in the prompt as the first pass's loadout. Mirrors the server's ORCHESTRATOR_MODEL
// and composeQuestPrompt (jobs/kinds.ts); the client cannot import server code.
const ORCHESTRATOR_MODEL = 'sonnet';
// The same allow-lists the server checks (jobs/kinds.ts). The copied line sits inside a
// double-quoted shell string, so a value outside them is left out, never copied.
const AGENT_NAME = /^[a-z][a-z0-9-]*$/;
const MODELS = ['haiku', 'sonnet', 'opus'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The copied line for a quest (exported for the unit test that ties it to the server's
 * `composeQuestPrompt`). Returns null without a valid model. */
export function boardingLine(command: string, agent?: string | null, model?: string | null, effort?: string | null): string | null {
  if (!model || !MODELS.includes(model)) return null;
  const parts = [agent && AGENT_NAME.test(agent) ? `agent=${agent}` : null, `model=${model}`, effort && EFFORTS.includes(effort) ? `effort=${effort}` : null];
  return `claude --model ${ORCHESTRATOR_MODEL} "${command} first pass: ${parts.filter(Boolean).join(' ')}"`;
}

interface Props {
  /** The first pass's agent, shown on the "first pass" line and sent in the prompt. */
  agent?: string | null;
  /** The first pass's effort, shown and sent the same way. */
  effort?: string | null;
  /** A quest missing `model` in its front matter cannot compose a real line (IssueCard already
   * flags this quest's loadout as incomplete elsewhere) -- the button disables rather than copies
   * a line with a blank model in it. */
  model: string | null;
  /** Already `/factory-run NN`, zero-padded -- the same string the server's own `next.command`
   * field carries (model/parse.ts's `pad()`), so this component never re-derives the padding
   * rule on its own. */
  command: string;
  label?: string;
}

export function BoardingPass({ agent, effort, model, command, label = 'Launch' }: Props) {
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const line = boardingLine(command, agent, model, effort);
  const shownAgent = agent && AGENT_NAME.test(agent) ? agent : null;
  const shownEffort = effort && EFFORTS.includes(effort) ? effort : null;

  const copy = async () => {
    if (!line) return;
    await navigator.clipboard.writeText(line);
    setToast(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(false), 3000);
  };

  return (
    <span className="boarding-pass">
      <button
        type="button"
        className="action-button"
        disabled={!line}
        title={line ?? 'this quest has no model in its front matter'}
        onClick={copy}
      >
        {label}
      </button>
      {line ? (
        <span className="boarding-pass__lines">
          <span className="boarding-pass__line">orchestrator {ORCHESTRATOR_MODEL}</span>
          <span className="boarding-pass__line">
            first pass {[shownAgent, model, shownEffort].filter(Boolean).join(' ')}
          </span>
        </span>
      ) : null}
      {toast ? (
        <span className="boarding-pass__toast" role="status">
          Copied to clipboard
        </span>
      ) : null}
    </span>
  );
}
