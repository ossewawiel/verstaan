// SPDX-License-Identifier: MPL-2.0
// The Jobs room (issue 100 "Shape"): the live stream for one job, coloured by stdout/stderr,
// with its exit code and duration, and every job's rerun button. Reachable at /jobs (the list)
// and /jobs/:id (a job selected and streaming).
import { useState, type SyntheticEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useJobsQuery } from '../api/queries';
import { useJobStream } from '../api/useJobStream';
import { api, type JobQuestion, type JobSummary } from '../api/client';
import { ActionButton } from '../components/ActionButton';

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  const s = Math.round(ms / 100) / 10;
  return `${s}s`;
}

const STATUS_LABEL: Record<JobSummary['status'], string> = {
  queued: 'queued',
  running: 'running',
  done: 'done',
  failed: 'failed',
  killed: 'killed',
};

function JobList({ jobs, selected }: { jobs: JobSummary[]; selected: string | null }) {
  const navigate = useNavigate();
  return (
    <ul className="storylist job-list" aria-label="Jobs">
      {jobs
        .slice()
        .reverse()
        .map((j) => (
          <li key={j.id}>
            <button
              type="button"
              className={`job-list__item job-list__item--${j.status}${j.id === selected ? ' job-list__item--selected' : ''}`}
              aria-current={j.id === selected}
              onClick={() => navigate(`/jobs/${j.id}`)}
            >
              <span className="job-list__kind">{j.kind}</span>
              <span className="job-list__status">{STATUS_LABEL[j.status]}</span>
              <span className="job-list__meta">
                {j.exitCode != null ? `exit ${j.exitCode}` : ''} {fmtDuration(j.durationMs)}
              </span>
              {j.queuedReason ? <span className="job-list__queued">{j.queuedReason}</span> : null}
            </button>
          </li>
        ))}
      {jobs.length === 0 ? <li className="muted">No jobs yet. Run one from the Console room's Actions rail.</li> : null}
    </ul>
  );
}

// Issue 178 (ADR 0016): the one thing this quest adds to the Jobs room. `question.input` is the
// `AskUserQuestion` tool's own raw payload -- shown verbatim, never interpreted here, so a
// question shape this room has never seen before still displays something rather than nothing.
// Submitting posts the free-text answer and resolves the session's own held promise
// (server/src/jobs/runner.ts's `answerQuestion`); there is no "options" UI here on purpose --
// "Not in scope: redesigning the Jobs room beyond the question card" -- free text is the one shape
// that answers any question, structured or not.
function QuestionCard({ jobId, question }: { jobId: string; question: JobQuestion }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const answer = text.trim();
    if (!answer || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.jobs.answer(jobId, answer);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="panel job-question" onSubmit={submit}>
      <p className="panel__title">Checkpoint: the run is waiting for an answer</p>
      <pre className="job-question__prompt">{JSON.stringify(question.input, null, 2)}</pre>
      <textarea
        className="job-question__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type an answer…"
        rows={3}
        aria-label="Answer"
      />
      {error ? <p className="job-question__error">{error}</p> : null}
      <button type="submit" className="action-button" disabled={sending || !text.trim()}>
        {sending ? 'Sending…' : 'Answer'}
      </button>
    </form>
  );
}

function JobDetail({ job }: { job: JobSummary }) {
  const stream = useJobStream(job.id);
  const navigate = useNavigate();
  const status = stream.status ?? job.status;
  const exitCode = stream.exitCode ?? job.exitCode;

  const rerun = async () => {
    const { id } = await api.jobs.create(job.kind, job.tree, job.args);
    navigate(`/jobs/${id}`);
  };
  const kill = async () => {
    await api.jobs.kill(job.id);
  };

  return (
    <div className="panel job-detail">
      <p className="panel__title">
        {job.kind} — {STATUS_LABEL[status]}
        {exitCode != null ? ` (exit ${exitCode})` : ''}
      </p>
      <p className="panel__ctx">
        tree <code>{job.tree}</code> · duration {fmtDuration(job.durationMs ?? (job.startedAt ? Date.now() - job.startedAt : null))}
      </p>
      <div className="job-detail__actions">
        <ActionButton label="Rerun" onRun={rerun} />
        <ActionButton
          label="Kill"
          armedLabel="Confirm: kill this job"
          destructive
          disabled={status !== 'running' && status !== 'queued'}
          onRun={kill}
        />
      </div>
      {job.question ? <QuestionCard jobId={job.id} question={job.question} /> : null}
      <pre className="job-stream" aria-live="polite" aria-label="Job output">
        {stream.lines.length === 0 ? '(no output yet)\n' : null}
        {stream.lines.map((l, i) => (
          <span key={i} className={`job-stream__line job-stream__line--${l.stream}`}>
            {l.text}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

export function JobsRoom() {
  const { data: jobs, isLoading } = useJobsQuery();
  const { id } = useParams<{ id: string }>();
  const selected = id ?? null;
  const job = jobs?.find((j) => j.id === selected) ?? null;

  return (
    <section>
      <p className="altitude__band">Jobs</p>
      <h1 className="headline">Jobs</h1>
      <p className="lede">Every gate, test and sync the console has run, with its live output.</p>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="jobs-layout">
          <JobList jobs={jobs ?? []} selected={selected} />
          {job ? <JobDetail job={job} /> : <p className="muted">Select a job to see its output.</p>}
        </div>
      )}
    </section>
  );
}
