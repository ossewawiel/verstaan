<!--
docs/factory/git-workflow.md: a milestone branch opens a draft PR at its first push, using this
template. `gh pr ready` stays behind the `require-gate` hook: it refuses unless the gate stamp
equals HEAD and the tree is clean.
-->

## Summary

<!-- One or two sentences: what this branch does, in the house voice (docs/standards/voice.md). -->

## Issues closed

<!-- One line per issue file this branch closes, in the form: Closes #NN (docs/factory/issues/NN-slug.md) -->

## Gate report

<!-- Paste the `/gate` step-by-step output: each step's command, exit code and time
     (docs/factory/playbook.md, "The gate ladder"). A PR without a green full gate is not ready. -->

## Verifier report

<!-- The verifier's read of the diff, in the house voice. Left blank until checkpoint 4 runs. -->

## Checklist

- [ ] Every "Done when" line in each closed issue file is ticked against the diff.
- [ ] `/gate` passed and the stamp equals HEAD (`require-gate` will refuse `gh pr ready` otherwise).
- [ ] No generated file under `engine/generated/` was hand-edited.
- [ ] No credential, token or personal data was added to the repository.
- [ ] Each closed issue file says `status: done` with its commit hash, in its own `chore(#NN): close` commit.
