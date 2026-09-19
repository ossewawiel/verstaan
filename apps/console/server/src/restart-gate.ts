// SPDX-License-Identifier: MPL-2.0
// The one flag `POST /api/restart` and `POST /api/jobs` both check (issue 162, checkpoint-4
// review findings 3 and 4). A restart is a multi-second window -- `ensureBuilt` can run `npm run
// build`, commonly several seconds -- during which:
//   - no job may start (finding 3): `JobManager.runningJob()` alone only refuses a job already
//     running *before* the restart began, checked once, at the top of the route handler. A job
//     that starts two seconds into an eight-second build is never refused, and is killed with no
//     exit code when the old process exits, exactly the failure mode the 409 message on that
//     check already warns about.
//   - no second restart may begin (finding 4): two concurrent `npm run build` in the same
//     directory collide -- vite's `emptyOutDir: true` means one build's output can be wiped
//     mid-write by the other's.
// A restart is global, never per-tree, unlike `JobManager.runningByTree`'s own per-tree gate on
// concurrent job starts, which this mirrors in shape but not in scope. A separate module (not a
// method on `JobManager` or a field on `restart.ts`'s own state) so `jobs/routes.ts` and
// `restart.ts` can both import it without importing each other.
//
// Issue 178 (ADR 0016): `quest-run` is the one kind exempt from the "no job may run across a
// restart" rule this flag exists to enforce. That exemption lives in `JobManager.runningJob()`
// (`jobs/runner.ts`) -- the one thing `POST /api/restart` (`restart.ts`) actually asks before it
// ever touches this flag -- not here: this class only ever tracks "is a restart currently in
// flight", the same way regardless of which kinds are running.
export class RestartGate {
  private active = false;

  isActive(): boolean {
    return this.active;
  }

  /** Sets the flag and returns true, unless a restart is already in flight, in which case it
   * returns false and leaves the existing flag untouched. */
  begin(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  /** Only called when the restart *failed* (`runLauncher` returned `ok: false`): a succeeding
   * restart never calls this -- the process is exiting anyway, and there is nothing left here to
   * un-gate. */
  end(): void {
    this.active = false;
  }
}
