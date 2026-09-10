// SPDX-License-Identifier: MPL-2.0
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useIssuesQuery } from '../api/queries';
import { IssueCard, type Links } from './IssueCard';
import type { Issue } from '../api/client';

/** The same rule the server uses (`SIDE` in server/src/model/parse.ts): a side quest is any
 * quest whose milestone is `Side` or `Post-M6`; everything else is on the main quest line. */
export const SIDE = new Set(['Side', 'Post-M6']);
export const isSide = (i: Pick<Issue, 'milestone'>): boolean => SIDE.has(i.milestone);

/** Who blocks whom, from `depends_on` alone (issue 104). `blockedBy` is the quest's own open
 * dependencies; `blocks` is every open quest that lists this one. Each link carries whether it
 * crosses the main/side divide, which is the case the room must make impossible to miss: a side
 * quest holding up the main line, or a main quest a side quest is waiting on. */
export function linksOf(issues: Issue[]): Map<number, Links> {
  const by = new Map(issues.map((i) => [i.n, i]));
  const out = new Map<number, Links>();
  for (const i of issues) out.set(i.n, { blockedBy: [], blocks: [] });
  for (const i of issues) {
    for (const d of i.dependsOn) {
      const dep = by.get(d);
      if (!dep) {
        out.get(i.n)!.blockedBy.push({ n: d, title: 'unknown quest', status: 'open', side: false, cross: false, missing: true });
        continue;
      }
      const cross = isSide(i) !== isSide(dep);
      if (dep.status !== 'done') out.get(i.n)!.blockedBy.push({ n: dep.n, title: dep.title, status: dep.status, side: isSide(dep), cross, missing: false });
      if (i.status !== 'done') out.get(dep.n)!.blocks.push({ n: i.n, title: i.title, status: i.status, side: isSide(i), cross, missing: false });
    }
  }
  return out;
}

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

  const links = useMemo(() => linksOf(issues ?? []), [issues]);

  const filtered = useMemo(() => {
    if (!issues) return [] as Issue[];
    return issues.filter(
      (i) => (!milestone || i.milestone === milestone) && (!status || i.status === status) && (!agent || i.agents.includes(agent)),
    );
  }, [issues, milestone, status, agent]);

  // Two halves of the room (issue 104): the main quest line, grouped by milestone in first-seen
  // order, and the side quests. A quest never appears in both.
  const main = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, Issue[]>();
    for (const i of filtered) {
      if (isSide(i)) continue;
      if (!by.has(i.milestone)) {
        by.set(i.milestone, []);
        order.push(i.milestone);
      }
      by.get(i.milestone)!.push(i);
    }
    return order.map((name) => ({ name, issues: by.get(name)! }));
  }, [filtered]);
  const side = useMemo(() => filtered.filter(isSide), [filtered]);

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

  const crossBlocks = [...links.values()].reduce((n, l) => n + l.blockedBy.filter((b) => b.cross).length, 0);

  return (
    <section>
      <p className="altitude__band">Quests</p>
      <h1 className="headline">The backlog</h1>
      <p className="lede">
        The main quest line and the side quests, filtered by milestone, status or agent. Open a card for its detail.
        {crossBlocks > 0 ? ` ${crossBlocks} block(s) cross the line between main and side.` : ''}
      </p>
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

      <section className="quest-half" aria-labelledby="main-quests-heading">
        <h2 className="quest-half__title" id="main-quests-heading">
          Main quests
        </h2>
        {main.length === 0 ? <p className="muted">None match the filter.</p> : null}
        {main.map((m) => (
          <div key={m.name} className="quest-group">
            <p className="quest-group__title">{m.name}</p>
            <ul className="storylist" aria-label={`Main quests, ${m.name}`}>
              {m.issues.map((issue) => (
                <IssueCard key={issue.n} issue={issue} links={links.get(issue.n)!} expanded={expanded.has(issue.n)} onToggle={toggle} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="quest-half" aria-labelledby="side-quests-heading">
        <h2 className="quest-half__title" id="side-quests-heading">
          Side quests
        </h2>
        {side.length === 0 ? <p className="muted">None match the filter.</p> : null}
        <ul className="storylist" aria-label="Side quests">
          {side.map((issue) => (
            <IssueCard key={issue.n} issue={issue} links={links.get(issue.n)!} expanded={expanded.has(issue.n)} onToggle={toggle} />
          ))}
        </ul>
      </section>
    </section>
  );
}
