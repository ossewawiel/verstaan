// SPDX-License-Identifier: MPL-2.0
// The bridge's boot sequence (issue 173): the amber systems-check the CIC voice implies, playing
// once per page load over the bridge's own content, which is already rendered underneath it --
// this is chrome, never a gate the rest of the room waits behind.
import { useEffect, useRef, useState } from 'react';

const LINES = ['CIC power — online', 'Comms array — syncing', 'Sensor sweep — clear', 'Bridge — ready'];

const STEP_MS = 260;
const TAIL_MS = 400;

/** Module-scope, not component state: it survives a route change away from and back to the
 * bridge (an unmount/remount within the same SPA session), and resets only on an actual page
 * load, when this module is re-evaluated from scratch. That is what "plays once per page load"
 * means here, not merely once per mount. */
let played = false;

export function BootSequence() {
  // Read once, before the first paint: a visitor with the preference set sees the finished state
  // immediately, no animation frame spent (issue 173 acceptance criteria).
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [done, setDone] = useState(played || reducedMotion.current);

  useEffect(() => {
    if (played || reducedMotion.current) {
      played = true;
      return;
    }
    played = true;
    const t = setTimeout(() => setDone(true), LINES.length * STEP_MS + TAIL_MS);
    return () => clearTimeout(t);
    // Empty deps: this effect runs once, on the first mount of the first BootSequence instance a
    // page load ever creates. A later re-render of the same instance (the bridge's own once-a-
    // second clock tick, an SSE-driven refetch) never re-runs it, so the sequence itself never
    // repeats -- only `done` flips, once, from false to true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) return null;

  return (
    <div className="boot-sequence" aria-hidden="true" data-testid="boot-sequence">
      <ul className="boot-sequence__lines">
        {LINES.map((line, i) => (
          <li key={line} className="boot-sequence__line" style={{ animationDelay: `${i * (STEP_MS / 1000)}s` }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
