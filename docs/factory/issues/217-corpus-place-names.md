---
issue: 217
title: "The corpus's places get their records, and A09 and A15 read Genève and Parys"
milestone: Side
status: open
depends_on: [207]
agent: rule-author
agents: [rule-author, implementer]
model: opus
effort: high
checkpoint: null
commit: null
worktree: null
github_issue: null
---
## What

The stores hold almost no place names. Of the corpus's places, the English store holds only `Paris`,
and the Afrikaans store holds none. So a place shows marked once quest 207 lands, `⟦Geneva⟧` and
`⟦Paris⟧`, and the mark shows the gap. The owner ruled on 2026-10-29 that most old-world places have an
Afrikaans name, with Dutch as the guide, and on 2026-11-04: "Write now, 11 places".

The corpus holds 11 UWs in the `500` range. Nine are places, and this quest adds them. The tenth is the
language `English`, and both stores already hold `English` and `Engels`. The eleventh is `Shakespeare`,
a person, who gets no record and stays bare under quest 207's rule. The Afrikaans corpus already gives
each form, so the rule-author drafts nothing from Dutch.

| UW | English | Afrikaans | Corpus uses |
|---|---|---|---|
| `500003943` | Paris | Parys | 22 |
| `500004419` | Geneva | Genève | 3 |
| `500004416` | Switzerland | Switserland | 2 |
| `500003213` | Prague | Praag | 1 |
| `500003428` | Rome | Rome | 1 |
| `500003815` | India | Indië | 1 |
| `500005179` | Africa | Afrika | 1 |
| `500005233` | Atlantic Ocean | Atlantiese Oseaan | 1 |
| `500005395` | Europe | Europa | 1 |

`Paris` has an English record under `112469372`, and quest 207's rule uses it. The rule-author says
which UW the Afrikaans record carries so the two meet, and whether the corpus's `500003943` joins them.
`Atlantic Ocean` is two tokens, so the rule-author says whether a two-word name works today. Rome's UW
is read from one sentence that holds three places, so the rule-author confirms it.

After this quest, `a book about Geneva` gives `'n boek oor Genève`, status `ok`. A15 reads `Parys`
where it read `⟦Paris⟧`. The owner reviews every form on one page before it lands.

## Acceptance criteria

- Each place above has an English and an Afrikaans record with a UW they share. `python -m
  tools.validate --changed` exits 0, and each record's `source` names its corpus line.
- `$V "a book about Geneva"` prints `'n boek oor Genève` and exits 0.
- `$V "a book about Brisbane"` still prints a bare `Brisbane`. `$V "John and Mary"` still prints
  `John en Mary`.
- Row A09 expects `'n boek oor Genève`, status `ok`. Row A15 expects `Parys`, in both `basic.yaml`
  copies and in `24-test-cases.md`.
- Each store's `meta.yaml` counts match its dictionary.
- A golden row covers each place, each with its `review` mark set by the owner.
- `ctest --preset linux-gcc -L fast` passes.

## Not in scope

The wider list of old-world cities, countries and regions from the Dutch archive: a later quest, if the
owner wants it. New-world places, which keep their own name. People. The rule that decides what a name
is: quest 207. Inflected forms of a place name.

## Done when

- [ ] The owner has reviewed all nine forms on one page, and the review marks are set.
- [ ] Nine places have records in both stores, and `python -m tools.validate --changed` exits 0.
- [ ] `$V "a book about Geneva"` gives `'n boek oor Genève`, exit 0, in a golden row.
- [ ] A15 expects `Parys` in both `basic.yaml` copies and in `24-test-cases.md`.
- [ ] `a book about Brisbane` and `John and Mary` stay bare, in a test.
- [ ] `meta.yaml` counts match each dictionary.
- [ ] `ctest --preset linux-gcc -L fast` is green.
