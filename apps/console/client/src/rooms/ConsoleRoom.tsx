// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useStateQuery, useWorktreesQuery } from '../api/queries';
import { loadoutOf } from './IssueCard';
import { ActionsRail } from '../components/ActionsRail';
import { ActionButton } from '../components/ActionButton';
import { api } from '../api/client';

export function ConsoleRoom() {
  const { data: model, isLoading } = useStateQuery();
  const { data: worktrees } = useWorktreesQuery();
  const navigate = useNavigate();
  const prevMetrics = useRef<Map<string, string>>(new Map());
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());

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

  return (
    <section>
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
              {model.inProgress.map((q) => (
                <li key={q.n}>
                  <Link to={`/quests/${String(q.n).padStart(2, '0')}`}>
                    #{String(q.n).padStart(2, '0')} {q.title}
                  </Link>{' '}
                  — {q.tree ?? '(this tree)'}
                </li>
              ))}
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
                <span className={`story__loadout${loadoutOf(model.next).complete ? '' : ' story__loadout--missing'}`}>{loadoutOf(model.next).text}</span>
                {' '}· <code>{model.next.command}</code>
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
      </div>

      <div className="tiles">
        {model.milestones.map((m) => (
          <Link key={m.name} to={`/quests?milestone=${encodeURIComponent(m.name)}`} className="tile snub">
            <span className="tile__corner" />
            <p className="tile__title">{m.name}</p>
            <p className="tile__blurb">{m.won} of {m.total} won</p>
            <span className={`tile__metric${pulsing.has(m.name) ? ' tile__metric--pulse' : ''}`}>{m.won}/{m.total}</span>
          </Link>
        ))}
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
        <ul className="storylist">
          {model.party.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.model}, effort {p.effort}. {p.role}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
