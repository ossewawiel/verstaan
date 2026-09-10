// SPDX-License-Identifier: MPL-2.0
// One SSE subscription (the server's /events) that invalidates the query matching the changed
// section, instead of a full reload. This is what keeps an open card's DOM node alive when a
// worktree file changes underneath it (issue 99's flicker proof).
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const SECTION_KEYS: Record<string, string[][]> = {
  issues: [['issues'], ['state']],
  docs: [['docs'], ['library']],
  party: [['state']],
  git: [['state'], ['worktrees']],
  worktrees: [['worktrees'], ['state']],
  state: [['state'], ['issues'], ['worktrees'], ['ledger']],
};

export function useChangeStream(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/events');
    source.addEventListener('state', (event) => {
      let section = 'state';
      try {
        section = (JSON.parse((event as MessageEvent).data) as { section?: string }).section ?? 'state';
      } catch {
        /* a malformed event still invalidates everything, safely */
      }
      const keys = SECTION_KEYS[section] ?? SECTION_KEYS.state;
      for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
    });
    return () => source.close();
  }, [queryClient]);
}
