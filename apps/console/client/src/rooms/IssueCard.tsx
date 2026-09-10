// SPDX-License-Identifier: MPL-2.0
import { memo } from 'react';
import type { Issue } from '../api/client';

const GLYPH: Record<Issue['status'], string> = { done: '●', 'in-progress': '◐', open: '○' };
const LABEL: Record<Issue['status'], string> = { done: 'done', 'in-progress': 'in progress', open: 'open' };
const STATUSES: Issue['status'][] = ['done', 'in-progress', 'open'];

/** The loadout: who takes the quest, at which model and effort (SPEC.md §6, playbook "Resource
 * rules"). It is the armour and weapons the quest is embarked with, so it sits on the summary
 * row, visible without opening the card, the way the file console's meta line showed it. A quest
 * file missing any of the three is flagged rather than left blank: `tools.validate --all`
 * refuses such a file, and the card says so in the meantime. */
export function loadoutOf(issue: Pick<Issue, 'agent' | 'model' | 'effort'>): { text: string; complete: boolean } {
  const complete = Boolean(issue.agent && issue.model && issue.effort);
  return complete
    ? { text: `${issue.agent} / ${issue.model} / ${issue.effort}`, complete }
    : { text: `no loadout: ${[!issue.agent && 'agent', !issue.model && 'model', !issue.effort && 'effort'].filter(Boolean).join(', ')} missing`, complete };
}

interface Props {
  issue: Issue;
  expanded: boolean;
  onToggle: (n: number) => void;
}

/** One quest card. `React.memo` keeps a card that has not changed from re-rendering at all when
 * a sibling's data does (issue 99's flicker proof): the list re-renders on every SSE-driven
 * refetch, but a card whose own `issue` object is referentially unchanged bails out here. */
function IssueCardImpl({ issue, expanded, onToggle }: Props) {
  const id = String(issue.n).padStart(2, '0');
  const loadout = loadoutOf(issue);
  return (
    <li className={`story story--${issue.status}`}>
      <button
        type="button"
        className="story__summary"
        aria-expanded={expanded}
        aria-controls={`quest-detail-${id}`}
        id={`quest-summary-${id}`}
        onClick={() => onToggle(issue.n)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && expanded) onToggle(issue.n);
        }}
      >
        <span className="story__id">#{id}</span>
        <span className="story__title">
          {issue.title}
          <span className={`story__loadout${loadout.complete ? '' : ' story__loadout--missing'}`}>{loadout.text}</span>
        </span>
        <span className="story__status">
          {/* All three glyphs and all three labels are always in the DOM, one shown per status
              (issue 99: "no layout shift on update"). A real browser's Layout Instability API
              attributes a shift to a text node whenever its own characters change, even inside a
              box whose size and position never move (its glyph-run metrics still differ) — the
              only way to get zero `layout-shift` entries for a status that changes on an
              SSE-driven update is to never touch a text node's characters at all, only toggle
              which of three constant, pre-rendered text nodes is visible. */}
          {STATUSES.map((s) => (
            <span key={s} className="status-glyph" aria-hidden="true" hidden={s !== issue.status}>
              {GLYPH[s]}
            </span>
          ))}
          {STATUSES.map((s) => (
            <span key={s} className="status-label" hidden={s !== issue.status}>
              {LABEL[s]}
            </span>
          ))}
        </span>
      </button>
      {expanded && (
        <div className="story-detail" id={`quest-detail-${id}`} role="region" aria-labelledby={`quest-summary-${id}`}>
          <p className="story-detail__what">{issue.what}</p>
          <dl className="deflist">
            <dt>Milestone</dt>
            <dd>{issue.milestone}</dd>
            <dt>Depends on</dt>
            <dd>{issue.dependsOn.length ? issue.dependsOn.map((d) => `#${String(d).padStart(2, '0')}`).join(', ') : 'none'}</dd>
            <dt>Agent</dt>
            <dd>{issue.agents.join(', ') || 'none'}</dd>
            <dt>Loadout</dt>
            <dd className={loadout.complete ? undefined : 'story__loadout--missing'}>{loadout.text}</dd>
            <dt>Checkpoint</dt>
            <dd>{issue.checkpoint != null ? String(issue.checkpoint) : 'none'}</dd>
            <dt>Worktree</dt>
            <dd>{issue.worktree ?? 'none'}</dd>
            <dt>Commit</dt>
            <dd>{issue.commit != null ? String(issue.commit) : 'none'}</dd>
            <dt>Done when</dt>
            <dd>
              {issue.doneWhen.ticked} / {issue.doneWhen.total}
            </dd>
          </dl>
        </div>
      )}
    </li>
  );
}

// Field-by-field, not reference equality: the server returns a freshly parsed JSON array on
// every refetch, so an unchanged issue never keeps its old object identity. Comparing the
// fields the card actually renders is what lets an untouched card skip re-rendering (and so
// touch zero DOM nodes) when a sibling issue's status changes underneath it.
function sameIssue(a: Issue, b: Issue): boolean {
  return (
    a.n === b.n &&
    a.title === b.title &&
    a.status === b.status &&
    a.what === b.what &&
    a.milestone === b.milestone &&
    a.doneWhen.ticked === b.doneWhen.ticked &&
    a.doneWhen.total === b.doneWhen.total &&
    a.dependsOn.join(',') === b.dependsOn.join(',') &&
    a.agents.join(',') === b.agents.join(',') &&
    a.agent === b.agent &&
    a.model === b.model &&
    a.effort === b.effort &&
    a.worktree === b.worktree &&
    String(a.checkpoint) === String(b.checkpoint) &&
    String(a.commit) === String(b.commit)
  );
}

export const IssueCard = memo(IssueCardImpl, (prev, next) => sameIssue(prev.issue, next.issue) && prev.expanded === next.expanded);
