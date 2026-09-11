// SPDX-License-Identifier: MPL-2.0
// The Actions rail (issue 100 "Shape"): one button per allow-listed kind, for the tree named by
// `tree` (the root tree on the Console room; a quest's own worktree on its card). Every button
// creates a job and hands the page to the Jobs room to watch it stream.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ActionButton } from './ActionButton';

interface RailAction {
  kind: string;
  label: string;
  args?: Record<string, unknown>;
  destructive?: boolean;
  armedLabel?: string;
}

const DEFAULT_ACTIONS: RailAction[] = [
  { kind: 'gate-fast', label: 'Run fast gate' },
  { kind: 'gate', label: 'Run full gate' },
  { kind: 'validate', label: 'Validate data' },
  { kind: 'mirror-check', label: 'Check GitHub drift' },
  { kind: 'mirror', label: 'Sync to GitHub', destructive: true, armedLabel: 'Confirm: sync to GitHub' },
  { kind: 'worktree-list', label: 'List worktrees' },
];

export function ActionsRail({ tree, actions = DEFAULT_ACTIONS }: { tree: string; actions?: RailAction[] }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const run = async (a: RailAction) => {
    setError(null);
    try {
      const { id } = await api.jobs.create(a.kind, tree, a.args ?? {});
      navigate(`/jobs/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="panel actions-rail" aria-label="Actions">
      <p className="panel__title">Actions — {tree}</p>
      <div className="actions-rail__buttons">
        {actions.map((a) => (
          <ActionButton key={a.kind} label={a.label} armedLabel={a.armedLabel} destructive={a.destructive} onRun={() => run(a)} />
        ))}
      </div>
      {error ? (
        <p className="muted" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
