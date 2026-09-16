// SPDX-License-Identifier: MPL-2.0
// The Debrief room (issue 176): docs/factory/lessons.jsonl, grouped by signature, newest group
// first. Promoting a group into a real rule runs the `lesson-promote` job kind -- behind the Host
// check every job already sits behind (ADR 0011) -- and writes nothing until the owner fills in a
// target file, a rule line and confirms twice (ActionButton's own "Enter twice" pattern).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebriefQuery } from '../api/queries';
import { api, type DebriefGroup } from '../api/client';
import { ActionButton } from '../components/ActionButton';

// The same "prefer, in order" shapes retro_promote.py enforces on its own write (issue 176,
// decision 2). A free-text target the owner might type is still validated server-side by the job
// kind and by retro_promote.py itself; this list only narrows the common case to a picker.
const TARGET_OPTIONS = [
  'docs/standards/cpp.md',
  'docs/standards/data.md',
  'docs/standards/testing.md',
  'docs/standards/voice.md',
  'docs/standards/writing.md',
  'CLAUDE.md',
];

function PromoteForm({ group }: { group: DebriefGroup }) {
  const navigate = useNavigate();
  const [target, setTarget] = useState(TARGET_OPTIONS[0]);
  const [rule, setRule] = useState('');

  const promote = async () => {
    const { id } = await api.jobs.create('lesson-promote', '.', { sig: group.sig, target, rule, approved: true });
    navigate(`/jobs/${id}`);
  };

  return (
    <form className="debrief-promote" aria-label={`Promote ${group.sig}`} onSubmit={(e) => e.preventDefault()}>
      <label>
        Target file
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {TARGET_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Rule
        <textarea value={rule} onChange={(e) => setRule(e.target.value)} placeholder="- The exact line to append." rows={2} />
      </label>
      <ActionButton label="Promote" armedLabel="Confirm: promote" destructive disabled={!rule.trim()} onRun={promote} />
    </form>
  );
}

export function DebriefRoom() {
  const { data: groups, isLoading, error } = useDebriefQuery();
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) return <p className="muted">Loading the debrief…</p>;
  if (error || !groups) return <p className="muted">Could not load the debrief.</p>;

  return (
    <section>
      <p className="altitude__band">Debrief</p>
      <h1 className="headline">Failure signatures, grouped</h1>
      <p className="lede">
        docs/factory/lessons.jsonl, one group per signature, newest first. Promoting a group runs `/factory-retro`'s promotion path and writes nothing
        until you fill in a target and a rule, then confirm.
      </p>
      {groups.length === 0 ? (
        <p className="muted">No lessons logged yet.</p>
      ) : (
        <ul className="storylist" aria-label="Failure signatures">
          {groups.map((g) => (
            <li key={g.sig} className="debrief-group">
              <button type="button" className="story__summary" aria-expanded={open === g.sig} onClick={() => setOpen(open === g.sig ? null : g.sig)}>
                <span className="story__id">{g.count}×</span>
                <span className="story__title">
                  {g.sig}
                  <span className="story__loadout">last seen {g.last || 'unknown'}</span>
                </span>
              </button>
              {open === g.sig && (
                <div className="story-detail">
                  <p className="story-detail__what">{g.detail || 'No detail recorded.'}</p>
                  <PromoteForm group={g} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
