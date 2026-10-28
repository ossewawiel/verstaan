# 0025 — A graph node the generation pass cannot place is appended and marked

Date: 2026-10-28 · Status: Accepted (owner decision, 2026-10-28)

## Context

SPEC.md §3.4: "`partial` means some words fell through untranslated and are marked in `text` with
`⟦word⟧`." Until issue 181, `Engine::translate` echoes the English tokens and marks each token with no
English dictionary entry. Generation replaces that echo, so the marks need a new rule.

Two owner-confirmed rows pull apart. A13, `John and Mary`, expects `John en Mary`, status `ok`. A09,
`a book about Geneva`, expects `'n boek oor ⟦Geneva⟧`, status `partial`. Issue 196 makes all three
names quoted literals. The corpus tells them apart by UW (`500004419` for Geneva); the engine cannot.
Issue 198 left the question to issue 181 (finding F3).

The UNL graph carries no source surface (`Graph`, `engine.hpp`). A word with no dictionary entry is
not a graph node (ADR 0019).

## Decision

- A name literal is a word whose surface is its text without quotes. When the pass places it, it
  shows as itself, unmarked.
- A graph node whose UW has no target entry has the surface `⟦<source surface>⟧`.
- A graph node that is not in `Forest::list` after the loop is appended to `text`, in graph order,
  as `⟦<source surface>⟧`.
- Then each source token with no dictionary entry and no name literal is appended, in input order,
  as `⟦<token>⟧`.
- A space separates each appended mark. `status` is `partial` when `text` holds a mark, else `ok`.
- `generate` takes the source surfaces as one string per graph node. A missing string marks the node
  with its UW.

## Rejected

| Option | Why not |
|---|---|
| Mark every name literal | A13 becomes `⟦John⟧ en ⟦Mary⟧`. A13 is in issue 181's exact-match list. |
| Drop a node the pass cannot place | The text loses a word with no sign. The owner cannot see the grammar gap. |
| Keep the token-based status, any unresolved token is `partial` | A13 stays `partial` with no mark in its text, against SPEC.md §3.4. |

## Consequences

- A13: `John en Mary`, `ok`. Rule 33 places both names.
- A09: `'n boek ⟦Geneva⟧`, `partial`. No rule places a literal under `cnt`: rule 4 reads `%y,N` and a
  literal has no `LEX` in generation. The mark survives, `oor` does not. When issue 182 gives a
  literal a noun reading, `Geneva` shows unmarked and A09 turns `ok`. The owner rules on A09 then.
- `book Geneva` gives `boek ⟦Geneva⟧`; `book xyzzy` gives `boek ⟦xyzzy⟧`. The three existing tests
  on these rows stay green.
- An appended word stands at the end, out of place. The mark makes that visible.
- Punctuation tokens are not graph nodes and leave `text`. A14's comma is issue 197's.
