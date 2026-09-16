// SPDX-License-Identifier: MPL-2.0
// The Codex briefing (issue 176): one quest's issue file, read at briefing density -- objective,
// intel, loadout, orders, after-action -- instead of the Quests room's table-row summary. Every
// field is sourced from the issue file's own headings and front matter (`GET /api/codex/:nn`);
// read-only, same as the Quests room's own deep-link card.
import { Link, useParams } from 'react-router-dom';
import { useCodexQuery } from '../api/queries';

function pad(n: number): string {
  return `#${String(n).padStart(2, '0')}`;
}

export function CodexRoom() {
  const { nn } = useParams();
  const n = nn ? Number(nn) : NaN;
  const { data: codex, isLoading, error } = useCodexQuery(n);

  if (isLoading) return <p className="muted">Loading the codex…</p>;
  if (error || !codex) return <p className="muted">Could not load a codex for {nn}.</p>;

  const loadoutText = codex.loadout.agent && codex.loadout.model && codex.loadout.effort ? `${codex.loadout.agent} / ${codex.loadout.model} / ${codex.loadout.effort}` : 'no loadout';

  return (
    <section>
      <p className="altitude__band">Codex</p>
      <h1 className="headline">
        {pad(codex.n)} {codex.title}
      </h1>
      <p className="lede">
        <Link to={`/quests/${String(codex.n).padStart(2, '0')}`}>Back to its quest card</Link>
      </p>

      <div className="panel">
        <p className="panel__title">Objective</p>
        <p>{codex.objective || 'No outcome sentence found in ## What.'}</p>
      </div>

      <div className="panel">
        <p className="panel__title">Intel</p>
        {codex.intel.length === 0 ? (
          <p className="muted">No ADR or glossary citation found in ## What.</p>
        ) : (
          <ul className="storylist">
            {codex.intel.map((i) => (
              <li key={`${i.kind}:${i.text}`}>
                <Link to={i.href}>{i.text}</Link> <span className="muted">({i.kind === 'adr' ? 'ADR' : 'glossary term'})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <p className="panel__title">Loadout</p>
        <dl className="deflist">
          <dt>Agent</dt>
          <dd>{codex.loadout.agent ?? 'none'}</dd>
          <dt>Model</dt>
          <dd>{codex.loadout.model ?? 'none'}</dd>
          <dt>Effort</dt>
          <dd>{codex.loadout.effort ?? 'none'}</dd>
          <dt>Checkpoint</dt>
          <dd>{codex.loadout.checkpoint != null ? String(codex.loadout.checkpoint) : 'none'}</dd>
        </dl>
        <p className="muted">{loadoutText}</p>
      </div>

      <div className="panel">
        <p className="panel__title">Orders</p>
        <p className="panel__ctx">Acceptance criteria</p>
        <pre className="codex-orders">{codex.orders.acceptanceCriteria || 'None recorded.'}</pre>
        <p className="panel__ctx">Not in scope</p>
        <pre className="codex-orders">{codex.orders.notInScope || 'None recorded.'}</pre>
      </div>

      <div className="panel">
        <p className="panel__title">After-action</p>
        <p>
          Done when: {codex.afterAction.doneWhen.ticked} / {codex.afterAction.doneWhen.total}
        </p>
        <p>Commit: {codex.afterAction.commit != null ? String(codex.afterAction.commit) : 'none yet'}</p>
        {codex.afterAction.verifier ? <pre className="codex-orders">{codex.afterAction.verifier}</pre> : <p className="muted">No ## Verifier section yet.</p>}
      </div>
    </section>
  );
}
