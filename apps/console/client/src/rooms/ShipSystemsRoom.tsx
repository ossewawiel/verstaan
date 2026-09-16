// SPDX-License-Identifier: MPL-2.0
// The factory's own machinery, read-only (issue 175): the agents, skills, commands and hooks a
// quest runs on, and the playbook's own encounter path as one lane. Nothing here writes anything
// -- no POST, PUT, DELETE or job-runner call (see e2e/ship-systems.spec.ts's own network proof).
import { useShipSystemsQuery } from '../api/queries';

export function ShipSystemsRoom() {
  const { data, isLoading, error } = useShipSystemsQuery();

  if (isLoading || !data) return <p className="muted">Loading ship systems…</p>;
  if (error) return <p className="muted">Could not load ship systems.</p>;

  return (
    <section>
      <p className="altitude__band">Ship systems</p>
      <h1 className="headline">The factory's own machinery</h1>
      <p className="lede">
        Read-only instrumentation: the agents, skills and commands the party runs on, the hooks that fire on each event, and the encounter path a
        checkpoint and a gate follow.
      </p>

      <div className="panel">
        <p className="panel__title">The playbook lane</p>
        <p className="panel__ctx">docs/factory/playbook.md's own headings, station to station.</p>
        {data.playbookLane.length === 0 ? (
          <p className="muted">No stations found.</p>
        ) : (
          <ol className="ship-lane">
            {data.playbookLane.map((s, i) => (
              <li key={s.name} className="ship-lane__station">
                <span className="ship-lane__n">{String(i + 1).padStart(2, '0')}</span>
                <span className="ship-lane__name">{s.name}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="panel">
        <p className="panel__title">Agents</p>
        <p className="panel__ctx">.claude/agents/*.md</p>
        <ul className="ship-cards">
          {data.agents.map((a) => (
            <li key={a.name} className="ship-card">
              <p className="ship-card__title">{a.name}</p>
              <p className="ship-card__meta">
                {a.model} / {a.effort}
              </p>
              <p className="ship-card__desc">{a.description}</p>
              {a.tools.length > 0 && (
                <p className="ship-card__tools">
                  {a.tools.map((t) => (
                    <span key={t} className="ship-chip">
                      {t}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <p className="panel__title">Skills</p>
        <p className="panel__ctx">.claude/skills/*/SKILL.md</p>
        <ul className="storylist">
          {data.skills.map((s) => (
            <li key={s.name}>
              <strong>/{s.name}</strong>
              {s.argumentHint ? <code className="ship-hint"> {s.argumentHint}</code> : null} — {s.description}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <p className="panel__title">Commands</p>
        <p className="panel__ctx">.claude/commands/*.md</p>
        <ul className="storylist">
          {data.commands.map((c) => (
            <li key={c.name}>
              <strong>/{c.name}</strong> — {c.description}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <p className="panel__title">Hooks vs events</p>
        <p className="panel__ctx">.claude/hooks/* cross-referenced against the events .claude/settings.json registers. A gap either way stays visible.</p>
        <ul className="storylist">
          {data.hooks.events.map((e) => (
            <li key={e.event}>
              <strong>{e.event}</strong>
              {e.matcher ? <span className="ship-matcher"> ({e.matcher})</span> : null}
              <ul className="ship-sublist">
                {e.hooks.map((h) => (
                  <li key={h.command} className={h.exists ? undefined : 'ship-gap'}>
                    {h.file ?? h.command}
                    {!h.exists && <span className="ship-gap__label"> — no matching file</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <ul className="storylist">
          {data.hooks.files.map((f) => (
            <li key={f.file} className={f.referencedByEvents.length === 0 ? 'ship-gap' : undefined}>
              {f.file}
              {f.referencedByEvents.length > 0 ? ` — ${f.referencedByEvents.join(', ')}` : ''}
              {f.referencedByEvents.length === 0 && <span className="ship-gap__label"> — not referenced by any event</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
