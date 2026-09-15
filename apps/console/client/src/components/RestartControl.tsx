// SPDX-License-Identifier: MPL-2.0
// The Restart control (issue 162): the one way this console rebuilds and relaunches its own
// server process from the page. Armed like every other destructive action (`ActionButton`,
// issue 100's keyboard rule): first Enter/Space arms it, second fires it. On success the page
// polls /health until a new pid answers, then reloads itself; on refusal or a failed rebuild the
// server's own reason is shown here instead of leaving a dead tab.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { ActionButton } from './ActionButton';

type Phase = 'idle' | 'restarting' | 'error';

export function RestartControl() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  // Polls /health every 500ms until it answers with a pid different from the one captured before
  // the restart was fired (or answers at all, if no baseline pid was known). A failed fetch is
  // expected mid-poll: it is the gap between the old process exiting and the new one binding
  // (index.ts retries EADDRINUSE only while VERSTAAN_CONSOLE_RESTART is set on the new process).
  const pollForNewInstance = (previousPid: number | null) => {
    const poll = async () => {
      try {
        const { pid } = await api.health();
        if (previousPid == null || pid !== previousPid) {
          window.location.reload();
          return;
        }
      } catch {
        /* not answering yet */
      }
      pollTimer.current = setTimeout(poll, 500);
    };
    poll();
  };

  const run = async () => {
    setMessage(null);
    setPhase('idle');
    let previousPid: number | null = null;
    try {
      previousPid = (await api.health()).pid;
    } catch {
      previousPid = null;
    }
    try {
      await api.restart();
      setPhase('restarting');
      pollForNewInstance(previousPid);
    } catch (e) {
      // Either the 409 refusal (a job is running somewhere) or the 500 a failed rebuild sends --
      // both name their reason, and the old process is still the one that answered with it.
      setPhase('error');
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="status-row__item">
      <p className="panel__title">This console</p>
      <p className="panel__ctx">
        {phase === 'restarting' ? 'Rebuilding and relaunching… this page reloads once the new instance answers.' : 'Pick up a structural change under server/src or client/src'}
      </p>
      <ActionButton label="Restart console" armedLabel="Confirm: restart console" destructive disabled={phase === 'restarting'} onRun={run} />
      {phase === 'error' && message ? (
        <p className="muted" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
