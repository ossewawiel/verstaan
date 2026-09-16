// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useEventsQuery, useGithubStatusQuery, useIssuesQuery, useJobsQuery, useStateQuery, useWorktreesQuery } from '../api/queries';
import { loadoutOf } from './IssueCard';
import { ActionsRail } from '../components/ActionsRail';
import { ActionButton } from '../components/ActionButton';
import { RestartControl } from '../components/RestartControl';
import { BootSequence } from '../components/BootSequence';
import { BoardingPass } from '../components/BoardingPass';
import { api } from '../api/client';

/** mm:ss, or hh:mm:ss once an hour has passed. Elapsed time only ever grows while a job runs, so
 * there is no zero-padding edge case to chase beyond the usual two digits per field. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function ConsoleRoom() {
  const { data: model, isLoading } = useStateQuery();
  const { data: worktrees } = useWorktreesQuery();
  const { data: issues } = useIssuesQuery();
  // Only fetched while at least one quest is in flight (below): the active-encounter hero's
  // elapsed-time read-out needs the job runner's own `startedAt`, which `/api/state` does not
  // carry (issue 164's "Not in scope": no new field added to the state model for this quest).
  const { data: jobs } = useJobsQuery();
  const { data: events } = useEventsQuery();
  const { data: githubStatus, isLoading: githubLoading } = useGithubStatusQuery();
  const navigate = useNavigate();
  const prevMetrics = useRef<Map<string, string>>(new Map());
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  // Ticks once a second only so the elapsed-time read-out advances; it touches no other state
  // and nothing it renders is watched by the flicker or layout-shift proofs (those run on the
  // Quests room, not here).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // A changed tile pulses only its own metric (issue 99: "no layout shift on update"). The pulse
  // class is added for one animation cycle and then removed, so it never accumulates.
  useEffect(() => {
    if (!model) return;
    const changed = new Set<string>();
    for (const m of model.milestones) {
      const metric = `${m.won}/${m.total}`;
      if (prevMetrics.current.has(m.name) && prevMetrics.current.get(m.name) !== metric) changed.add(m.name);
      prevMetrics.current.set(m.name, metric);
    }
    if (changed.size) {
      setPulsing(changed);
      const t = setTimeout(() => setPulsing(new Set()), 900);
      return () => clearTimeout(t);
    }
  }, [model]);

  if (isLoading || !model) return <p className="muted">Loading the console…</p>;

  // The active encounter's elapsed time and party member (DESIGN.md "The one bold element"):
  // the job runner's own tree argument is the quest's `worktree:` frontmatter path (see
  // `IssueCard`'s `QuestActions` and the Actions rail below, both of which pass `issue.worktree
  // ?? '.'` the same way), not the branch name `inProgress[].tree` carries — so the match is done
  // against the issue file's own worktree path, read from `useIssuesQuery`, not the state model's
  // `inProgress` shape. No match (no running job for that tree, or the issues query still
  // loading) simply omits the read-out — the brief asks for it "if the job runner has one".
  const encounterMeta = (q: (typeof model.inProgress)[number]) => {
    const issue = issues?.find((i) => i.n === q.n);
    const job = issue ? jobs?.find((j) => j.tree === (issue.worktree ?? '.') && j.status === 'running' && j.startedAt != null) : undefined;
    const elapsed = job ? formatElapsed(now - job.startedAt!) : null;
    const station = model.party.find((p) => p.name === q.agent);
    return { elapsed, station };
  };

  // The next quest's milestone (issue 173 acceptance criteria: "milestone, agent, model and
  // effort" -- `model.next` already carries the last three straight from the issue file's own
  // front matter via /api/state's buildModel(); milestone is read the same way, from the same
  // issue's own row in /api/issues, joined by the number /api/state already named -- never a
  // hardcoded quest number).
  const nextIssue = model.next ? issues?.find((i) => i.n === model.next!.n) : undefined;

  return (
    <section>
      <BootSequence />
      <p className="altitude__band">CIC · combat information centre</p>
      <h1 className="headline">Verstaan</h1>
      <p className="lede">
        {model.totals.done} / {model.totals.issues} quests won. Branch <code>{model.git.branch}</code> at <code>{model.git.head}</code>
        {model.git.dirty > 0 ? `, ${model.git.dirty} file(s) dirty` : ', clean'}.
      </p>

      <div className="panel now-next">
        <p className="panel__title">Now / Next</p>
        <div className="nn-row nn-row--now">
          <span className="nn-row__label">Now</span>
          {model.inProgress.length === 0 ? (
            <span className="nn-row__text">Nothing in progress</span>
          ) : (
            <ul className="nn-row__text nn-row__list">
              {model.inProgress.map((q) => {
                const { elapsed, station } = encounterMeta(q);
                const loadout = loadoutOf(q);
                return (
                  <li key={q.n}>
                    <Link className="encounter__title" to={`/quests/${String(q.n).padStart(2, '0')}`}>
                      #{String(q.n).padStart(2, '0')} {q.title}
                    </Link>
                    {elapsed ? <span className="encounter__elapsed"> {elapsed}</span> : null}
                    <span className="encounter__meta">
                      tree {q.tree ?? '(this tree)'} ·{' '}
                      <span className={`story__loadout${loadout.complete ? '' : ' story__loadout--missing'}`}>{loadout.text}</span>
                      {station ? <span className="encounter__station"> · on station: {station.name}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="nn-row">
          <span className="nn-row__label">Last</span>
          <span className="nn-row__text">{model.last ? `#${String(model.last.n).padStart(2, '0')} ${model.last.title} — done` : 'Nothing closed yet'}</span>
        </div>
        <div className="nn-row">
          <span className="nn-row__label">Next</span>
          <span className="nn-row__text">
            {model.next ? (
              <>
                <Link to={`/quests/${String(model.next.n).padStart(2, '0')}`}>
                  #{String(model.next.n).padStart(2, '0')} {model.next.title}
                </Link>{' '}
                {nextIssue ? <span className="story__loadout">{nextIssue.milestone}</span> : null}
                {' '}
                <span className={`story__loadout${loadoutOf(model.next).complete ? '' : ' story__loadout--missing'}`}>{loadoutOf(model.next).text}</span>
                {' '}· <code>{model.next.command}</code>
                {' '}
                <BoardingPass model={model.next.model} command={model.next.command} />
              </>
            ) : (
              'None open'
            )}
          </span>
        </div>
        <div className="nn-row">
          <span className="nn-row__label">Side task</span>
          <span className="nn-row__text">{model.sideTask.text}</span>
        </div>
      </div>

      <div className="panel">
        <p className="panel__title">Recent events</p>
        {events && events.length === 0 ? (
          <p className="muted">No quest has landed yet.</p>
        ) : (
          <ul className="loot-log__list">
            {(events ?? []).map((e) => (
              <li key={e.n} className="loot-log__item">
                <span className="loot-log__title">
                  <Link to={`/quests/${String(e.n).padStart(2, '0')}`}>
                    #{String(e.n).padStart(2, '0')} {e.title}
                  </Link>
                </span>
                <span className="loot-log__commit">{e.commit != null ? String(e.commit) : 'no commit recorded'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ActionsRail tree="." />

      <div className="panel status-row">
        <div className="status-row__item">
          <p className="panel__title">Gate stamp</p>
          <p className="panel__ctx">{model.stamp.present && model.stamp.matches ? 'stamped for this commit' : model.stamp.present ? 'stamp present, does not match HEAD' : 'no stamp'}</p>
          <ActionButton
            label="Run the gate"
            onRun={async () => {
              const { id } = await api.jobs.create('gate', '.', {});
              navigate(`/jobs/${id}`);
            }}
          />
        </div>
        <div className="status-row__item">
          <p className="panel__title">Remote</p>
          <p className="panel__ctx">{model.git.remote}</p>
          <ActionButton
            label="Sync"
            destructive
            armedLabel="Confirm: sync to GitHub"
            onRun={async () => {
              const { id } = await api.jobs.create('mirror', '.', {});
              navigate(`/jobs/${id}`);
            }}
          />
        </div>
        <div className="status-row__item">
          <p className="panel__title">Ledger</p>
          <p className="panel__ctx">{model.lessons.total} lesson(s) logged</p>
          <ActionButton
            label="Open the retro proposal"
            onRun={async () => {
              const url = await api.open('doc', { path: 'docs/factory/playbook.md' });
              navigate(url);
            }}
          />
        </div>
        <div className="status-row__item">
          <p className="panel__title">GitHub</p>
          <p className={`panel__ctx status-chip${githubStatus?.reachable ? ' status-chip--ok' : ' status-chip--lost'}`}>
            {githubLoading ? 'checking…' : githubStatus?.reachable ? 'reachable' : 'comms-lost'}
          </p>
        </div>
        <RestartControl />
      </div>

      <div className="xp-grid">
        {model.milestones.map((m) => {
          const pct = m.total > 0 ? Math.round((m.won / m.total) * 100) : 0;
          return (
            <Link key={m.name} to={`/quests?milestone=${encodeURIComponent(m.name)}`} className="tile snub xp">
              <span className="tile__corner" />
              <p className="xp__title">{m.name}</p>
              <div className="xp__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.name} progress`}>
                <div className="xp__fill" style={{ width: `${pct}%` }} />
              </div>
              <span className={`xp__figure${pulsing.has(m.name) ? ' xp__figure--pulse' : ''}`}>{m.won} / {m.total} won</span>
            </Link>
          );
        })}
      </div>

      <div className="panel">
        <p className="panel__title">Trees</p>
        <ul className="storylist">
          {(worktrees ?? []).map((w) => (
            <li key={w.path}>
              <strong>{w.path}</strong> — {w.branch ?? '(detached)'} @ {w.head}
              {w.dirty > 0 ? `, ${w.dirty} dirty` : ''}
              {w.finished ? <span className="tree__finished"> · finished</span> : null}
              {/* A finished tree names no issue by definition (issue 112): `finished` requires no
                  in-progress issue file to name this tree, so `w.issue` is already null whenever
                  `w.finished` is true. */}
              {w.issue ? (
                <>
                  {' '}
                  ·{' '}
                  <Link to={`/quests/${String(w.issue.n).padStart(2, '0')}`}>#{String(w.issue.n).padStart(2, '0')} {w.issue.title}</Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <p className="panel__title">Party</p>
        <ul className="party-row">
          {model.party.map((p) => (
            <li key={p.name} className="party-tag" title={p.role}>
              <span className="party-tag__name">{p.name}</span>
              <span className="party-tag__loadout">{p.model} / {p.effort}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
