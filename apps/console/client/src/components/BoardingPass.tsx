// SPDX-License-Identifier: MPL-2.0
// The boarding pass (issue 174, L1): composes `claude --model <model> "/factory-run NN"` from a
// quest's own front matter and copies it to the clipboard on click -- the same line the owner
// types into a terminal today (docs/factory/STATE.md), with nothing new that touches the process.
// It ships on the bridge (the next-quest card, ConsoleRoom.tsx) and the flight deck (a per-quest
// card, IssueCard.tsx): the same component, mounted twice, never two implementations of the line.
import { useEffect, useRef, useState } from 'react';

interface Props {
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

export function BoardingPass({ model, command, label = 'Launch' }: Props) {
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const line = model ? `claude --model ${model} "${command}"` : null;

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
      {toast ? (
        <span className="boarding-pass__toast" role="status">
          Copied to clipboard
        </span>
      ) : null}
    </span>
  );
}
