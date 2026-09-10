// SPDX-License-Identifier: MPL-2.0
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useIssuesQuery } from '../api/queries';
import { IssueCard } from './IssueCard';
import type { Issue } from '../api/client';

export function QuestsRoom() {
  const { data: issues, isLoading } = useIssuesQuery();
  const { nn } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const lastDeepLinked = useRef<number | null>(null);

  const deepLinkN = nn ? Number(nn) : null;

  // Expand the deep-linked card once per distinct deep link; it does not re-collapse or
  // re-scroll on a later SSE-driven refetch (issue 99's flicker proof needs scroll and focus to
  // stay put), but it does re-trigger when navigating in-app to a *different* deep link (e.g.
  // browser back/forward between /quests/07 and /quests/08 while this room stays mounted).
  useEffect(() => {
    if (deepLinkN == null || lastDeepLinked.current === deepLinkN) return;
    lastDeepLinked.current = deepLinkN;
    setExpanded((prev) => new Set(prev).add(deepLinkN));
    requestAnimationFrame(() => {
      document.getElementById(`quest-summary-${String(deepLinkN).padStart(2, '0')}`)?.scrollIntoView({ block: 'center' });
    });
  }, [deepLinkN]);

  const milestone = params.get('milestone') ?? '';
  const status = params.get('status') ?? '';
  const agent = params.get('agent') ?? '';

  const filtered = useMemo(() => {
    if (!issues) return [] as Issue[];
    return issues.filter(
      (i) => (!milestone || i.milestone === milestone) && (!status || i.status === status) && (!agent || i.agents.includes(agent)),
    );
  }, [issues, milestone, status, agent]);

  const milestones = useMemo(() => [...new Set((issues ?? []).map((i) => i.milestone))].sort(), [issues]);
  const agents = useMemo(() => [...new Set((issues ?? []).flatMap((i) => i.agents))].sort(), [issues]);

  const toggle = (n: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
        if (deepLinkN === n) navigate('/quests', { replace: true });
      } else next.add(n);
      return next;
    });
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  if (isLoading) return <p className="muted">Loading quests…</p>;

  return (
    <section>
      <p className="altitude__band">Quests</p>
      <h1 className="headline">The backlog</h1>
      <p className="lede">Every quest, filtered by milestone, status or agent. Open a card for its detail.</p>
      <form className="quest-filters" aria-label="Filter quests">
        <label>
          Milestone
          <select value={milestone} onChange={(e) => setFilter('milestone', e.target.value)}>
            <option value="">All</option>
            {milestones.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in-progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label>
          Agent
          <select value={agent} onChange={(e) => setFilter('agent', e.target.value)}>
            <option value="">All</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </form>
      <ul className="storylist" aria-label="Quests">
        {filtered.map((issue) => (
          <IssueCard key={issue.n} issue={issue} expanded={expanded.has(issue.n)} onToggle={toggle} />
        ))}
      </ul>
    </section>
  );
}
