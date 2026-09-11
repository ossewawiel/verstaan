// SPDX-License-Identifier: MPL-2.0
// Subscribes to one job's SSE stream (`GET /api/jobs/:id/stream`). Lines arrive as `event: line`
// with a JSON-encoded `JobLine`; the final `event: exit` carries the status and exit code. Text
// only, ever: `JSON.parse` on the `data:` field, then rendered as a text node, never through
// `dangerouslySetInnerHTML` -- so a line containing `<script>` stays inert (issue 100 acceptance).
import { useEffect, useRef, useState } from 'react';
import type { JobLine, JobStatus } from './client';

export interface JobStreamState {
  lines: JobLine[];
  status: JobStatus | null;
  exitCode: number | null;
  connected: boolean;
}

export function useJobStream(id: string | null): JobStreamState {
  const [state, setState] = useState<JobStreamState>({ lines: [], status: null, exitCode: null, connected: false });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setState({ lines: [], status: null, exitCode: null, connected: false });
    if (!id) return;
    const es = new EventSource(`/api/jobs/${id}/stream`);
    esRef.current = es;
    es.addEventListener('open', () => setState((s) => ({ ...s, connected: true })));
    es.addEventListener('line', (ev) => {
      const line = JSON.parse((ev as MessageEvent).data) as JobLine;
      setState((s) => ({ ...s, lines: [...s.lines, line] }));
    });
    es.addEventListener('exit', (ev) => {
      const { status, exitCode } = JSON.parse((ev as MessageEvent).data) as { status: JobStatus; exitCode: number | null };
      setState((s) => ({ ...s, status, exitCode }));
      es.close();
    });
    es.onerror = () => {
      // A closed stream after a real `exit` event is expected, not a failure; EventSource has no
      // clean "the server closed me on purpose" signal, so this only marks the connection dead.
      setState((s) => ({ ...s, connected: false }));
    };
    return () => es.close();
  }, [id]);

  return state;
}
