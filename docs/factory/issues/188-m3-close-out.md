---
issue: 188
title: "M3 close-out: retro, verifier, tag m3, write the M4 quests"
milestone: M3
status: done
depends_on: [26, 183, 184, 185, 187, 202]
agent: docs-writer
agents: [docs-writer, verifier]
model: sonnet
effort: low
checkpoint: 4
commit: 617c810
worktree: null
github_issue: 289
---
## What

M1 closed with issue 12, and M2 with issue 18. Each close-out tagged `main` and wrote the next
milestone's quest files (`git-workflow.md` "Finishing a milestone"). M3 had no close-out. Without
one, nothing tags `m3` and nothing writes the M4 quests, so M4 has no issue files at all.

After this quest, `main` carries the tag `m3`, and the M4 quests exist, written from PLAN.md §7's
"M4 Compiler and tiers" row and from what M3 found. The M4 row promises the compiler that turns
the store and `tiers.toml` into `engine/generated/<tier>/` (SPEC §3.5, ADR 0003).
It also promises:

- `Engine::generated(Tier)`, which is still a stub today.
- The equivalence suite that diffs both back ends (ADR 0007).
- The three tiers and their memory budgets (SPEC §7, ADR 0006).
- The basic tier cross-built and run on a Pi Zero 2 W with the Argos benchmark beside it.
- Gate steps 5 and 6.

This quest also waits on side quest 202, which proves the golden loader's
deferred and pending paths before the verifier reads M3 (owner, 2026-11-04).

## Acceptance criteria

- `/factory-retro` has run, and its proposals are listed under `## Verifier` with the owner's
  answer to each.
- The verifier has read `git diff m2...main` for the M3 engine code, and its findings are listed.
  Each finding is fixed, or has its own quest.
- The M4 quest files exist with loadouts, `depends_on` and Done-when lines a test can check. They
  cover every M4 promise above, and `docs/factory/map.yaml` has a tile for each.
- Four decisions are recorded, each as a quest or a written "no" with its reason:
  - the 2026-09-16 engine-test-data brief (carve small store fixtures, so engine tests stop
    reading the 175 MB store); the owner deferred it to this quest on 2026-09-28;
  - the sensors quest issue 115 promised once M3 had engine code (an include-boundary lint, a
    coverage floor, mutation testing on changed engine files);
  - an M7 close-out and an `m7` tag; M7's quests 172 to 178 are done and it has neither;
  - the xxa/xxb fixture rows: either M4 gives the engine languages loaded from data, so those
    rows run, or they leave the golden glob and serve only the validator tests. Side quest 202
    registers them as skipped until this decision lands.
- `PLAN.md` §9 no longer asks the owner to schedule side quests 91 and 92, which are done.
- `main` is tagged `m3` after this issue's own commit merges: `git tag m3 main && git push origin m3`.

## Not in scope

Starting any M4 quest. M5 quests: they wait on the desktop UI technology, an open owner decision
(`verstaan.md` open question 6). Merging any other branch.

## Done when

- [x] The retro and verifier results are recorded under `## Verifier`.
- [x] The M4 quest files exist, with a tile each, and `STATE.md` names the first one next.
- [x] The carved-fixture, sensors, M7 close-out and xxa/xxb decisions are recorded.
- [x] `main` carries the tag `m3`, tagged after this issue's own commit merges.

## Verifier

### Retro, 2026-11-04

`/factory-retro` read six ledger lines. Each answer below is the owner's.

| Signature | Lines | Proposal | Answer |
|---|---|---|---|
| `fast-tests-red` | 4 | The lines share no cause: issue 1's is the deliberate red proof, and three are the Stop hook catching an implementer mid-pass. No new gate rule. Two lines said issue 185 and were #194's work, because `capture_failure.sh` read STATE.md's "Next up". The script now reads the branch name first. The four lines leave the ledger. | Yes. Landed in a `chore: retro` commit, test shown red first. |
| `pytest-red` | 1 | Issue 09's line is older than two milestones, and the Stop hook already runs pytest for changed tools. Delete it. | Yes. Landed in a `chore: retro` commit. |
| `compile-failed` | 1 | Recent and below the threshold. No proposal. | Not asked. |

The retro found one more fault. `capture_failure.sh` writes raw tab characters, so a ledger line can be invalid JSON. Quest 214 fixes it.

### Decisions, 2026-11-04

| Decision | Answer | Reason |
|---|---|---|
| Carved store fixtures | **Written no.** | All 319 engine tests run against the real 175 MB store in 7.0 seconds, and the slowest takes 0.14 s, because a lookup reads one shard. The brief's cost did not arrive. Reopen if `ctest -L fast` passes the Stop hook's 60-second target. What the compiler reads on a pull request is a different question, and quest 27 answers it. |
| Sensors from issue 115 | **Quest 206** for the include-boundary lint and a coverage floor. **Written no** for mutation testing. | The boundary lint guards ADR 0003, which M4 starts to stress. Coverage is measured on one Linux leg and may not drop. The 2026-09-11 brief itself says mutation score tracks real faults only weakly. No C++ mutation tool is verified on our legs, and `test(#NN)` commits already show a suite starts red. |
| M7 close-out | **Written no.** | Flight plan D5: the owner tagged `m7` on ca2f011 on 2026-10-27. New console work is a side quest, so there is no next map to write. |
| xxa/xxb rows | **Quest 28.** M4 makes the engine take languages from data, so the 17 rows run. | A 140 KB pair gives the compiler and the equivalence suite a subject small enough for every pull request. It also proves a new language needs no engine code before Dutch at M6. |
| Pi Zero run and Argos | **Quest 205, Post-M6.** ADR 0027 records the move. | Flight plan D6 holds over this issue's text. M4 cross-builds `arm-basic` and measures the 64 MB budget on x86-64. |

### Owner rulings on the verifier's F7, 2026-11-04

| Row | Ruling | Effect |
|---|---|---|
| A14 | `motor` | Expected text is now `'n motor, 'n boek en 'n beker`. Still deferred to 201. |
| A15, name | `⟦Paris⟧` stays marked, status partial. | Row text unchanged. Deferred to 215. The name's node in the graph follows quest 207's ADR, because corpus UW `500003943` is in no dictionary. |
| A09 | "Geneva should follow this rule as well actually it was a mistake to pass it" | Expected text is now `'n boek oor ⟦Geneva⟧`, status partial, `deferred: 207`. This reverses the 2026-11-03 ruling in ADR 0025's amendment. |
| A13 | `John en Mary` stays bare, status ok. | Quest 207 must find what separates a person from a place, and bring the mechanism to the owner before any test exists. |
| A15, `pictures` | `beelde` | Expected text now ends `sonder beelde en foto's`. Issue 201 builds the corpus graph, and quest 215 writes the generation rules. |
| Issue 201 | Moves to `Side`. The tag goes on at this merge. | `m3` marks 12 of 15 fixed rows passing. A09 is deferred to 207, A14 to 201, A15 to 215. The verifier counted 13 before the A09 ruling. Equivalence, quest 31, waits on 201. |
| Issue 201's scope | Splits. | 201 keeps the scopes, A14 end to end and A15's graph. Quest 215 writes A15's words. |
| `Next up` | Quest 216 fixes the script. | Without it the status script stops after 27 and 28, because it never picks a side quest. |

### Findings and where each one went

| Finding | Quest |
|---|---|
| F1 closed-class word lost, F5 rule cap | 208 |
| F2 capitals and names, F10.1, F10.2 | 207 |
| F3 plurals, F10.5 (the second read below moved `the cities` to paradigm M1) | 209 |
| F4 load failure, F9 I/O in `src/`, F10.3, the dictionary reopened per call from F8 | 210 |
| F6 reader against validator, F10.4 | 211 |
| F7 | Ruled above, carried by 201 |
| F8 cost bound | 212 |
| F9 docs, F10.6 | 213 |
| F11, F12, F13 | 214 |

### Working order, 2026-11-04

`python -m tools.factory.status` picks only main quests until quest 216 lands. This order satisfies every `depends_on`:

27, 28, 216, 213, 211, 207, 29, 210, 206, 30, 208, 201, 31, 212, 32, 203, 204.

Quest 215 follows 201. Quest 205 follows 32. Quests 200, 209 and 214 have no open blocker and fit anywhere.

### Second verifier read, this branch's own diff, 2026-11-04

Checkpoint 4 also read `git diff main` before the merge. It found errors in this plan, and all of them were fixed in the quest files before the work commit. The two rulings it needed are recorded above.

| Finding | What it saw | Fix |
|---|---|---|
| B1 | `24-test-cases.md` outranks the fixture and held the old rows, so a later agent would restore `kar`. | Table 24 and the fixture headers carry the rulings. |
| B2 | Quest 201 could not close: no rule writes `sonder` or handles `@generic`, and A15's Paris UW is in no dictionary. | Owner split it: quest 215. |
| B3 | `Next up` stopped after 27 and 28. | Owner chose quest 216. Working order above. |
| B4 | Quest 207 named a held-out file, and `testing.md:17` forbids that. | Sentence deleted. |
| B5 | Quest 207 fixed `Émile` as a marked name, against the ruling on person names. | The ADR names the output. |
| B6 | A run date in generated headers fails gate step 6 the next day. | Quest 29: no run date, and it handles the gap before quest 203. |
| B7 | "No allocation after load" cannot pass while `Result` returns by value. | Quest 27 decides the scope. |
| B8 | `stad` is paradigm M1 with per-entry FLX, so M5 and M17 support would not give `stede`. | Quest 209 covers M1 and FLX. |
| B9 | `file` never prints "ARMv8". | Quest 32 says `ARM aarch64`. |
| B10 | Equivalence named no tier, and `basic` holds only top-N words. | Quest 27 decides the tier and how an uncommitted tier builds. |
| M1 to M12 | Missing waits, missing SPEC lines, the 152.2 s test, the lost place ruling, the ledger's other raw bytes, a branch-number false match. | Added to quests 28 to 32 and 206 to 214, and to ADR 0025's amendment. |
| Done-when lines | Fifteen could not be checked by a command. | Tightened where a command exists. "Owner has ruled" lines point at `## Owner rulings`. Figures go under the quest's `## Verifier`. |

Not rechecked here: `validate --all`, which this read did not finish. Quest 211 runs it.

### Verifier report, verbatim

#### Checkpoint 4 verifier report: M3 engine (`m2...3024be9`)

Verdict: every confirmed row of the fixed set translates correctly, and the gates hold. One step outside the set, the engine loses words, plurals and whole grammar files and still reports `ok`. Every finding except one can wait as its own quest. F7 needs an owner ruling before the tag, and it needs no code.

**Tree.** I worked at `3024be9`. That commit is on local `main` and not on `origin/main`, which is at `907104a`. `3024be9` changes only `STATE.md`, so the engine diff is the same.

**Binary.** `V=build/linux-gcc/apps/cli/verstaan_cli`, preset `linux-gcc`. Each output below is what I ran.

**Suites at head.**
- `-L fast`: 287 of 287 pass.
- `-L golden`: 32 cases, exit 0. Of these, 13 rows match and 2 are deferred (A14, A15). The other 17 are xxa/xxb rows, skipped.
- `-L held-out`: 4 of 4 pass.

##### Block or wait

| # | Finding | Severity | m3 tag |
|---|---|---|---|
| F1 | A closed-class word disappears with status `ok` | High | Wait, own quest |
| F2 | A capital letter changes or stops the translation | High | Wait, own quest |
| F3 | Plurals of M5 and M17 nouns stay singular | High | Wait, own quest |
| F4 | A missing or corrupt grammar file gives status `ok` | High | Wait, own quest |
| F5 | The rule cap changes the text with status `ok` | Medium | Wait, own quest |
| F6 | The engine and the validator read different YAML | Medium | Wait, quest before the M4 compiler |
| F7 | A14 and A15 cannot pass as written, and issue 201 is still open under M3 | Medium | **Block: owner ruling only, no code** |
| F8 | Cost has no bound | Medium | Wait, own quest |
| F9 | Docs and code disagree | Medium | Wait, one docs quest |
| F10 | Decisions with no ADR | Medium | Wait, record with F2, F3, F6 and F9 |
| F11 | The golden loader drops a row with no `id` and reads one copy of the rows | Low | Wait |
| F12 | A D-rule reads an unreadable test as true and ignores its right side | Low | Wait |
| F13 | Byte-level text handling | Low | Wait |

##### Findings

###### F1 · A closed-class word disappears with status `ok` · High

**What we saw.** The tokens pass the dictionary, the forest forms, and the graph is read back. ADR 0019 says a closed-class word has no UW, so it is no graph node. If a rule folds the word into an attribute, nothing is lost. If no rule does, nothing records it. `engine/src/engine.cpp:204-210` collects surfaces only for nodes with a UW. `engine.cpp:216-224` marks only tokens with no dictionary entry. `engine/src/generation.cpp:1201` appends only unplaced graph nodes. ADR 0025 rejected this outcome for graph nodes: "The text loses a word with no sign." Closed-class words sit outside that rule. ADR 0019 line 42 also says "The owner may rule `ok` against `no_parse` later." I found no such ruling.

**Why it matters.** A reader translates `a book without a car`. The result reads `'n boek 'n motor`, "a book, a car", and `without` is gone. The exit code is 0, and nothing tells the caller the meaning changed.

**Input.**
```
$V "a book without a car"   exit=0  'n boek 'n motor
$V "a book but a car"       exit=0  'n boek 'n motor
$V "a book if a car"        exit=0  'n boek 'n motor
$V "a book for a car"       exit=0  'n boek 'n motor
$V "this book"              exit=0  boek
$V "every book"             exit=0  boek
$V "both books"             exit=0  boek
$V "."                      exit=0  (empty)
$V "and"                    exit=0  (empty)
$V "in the in the in the"   exit=0  (empty)
```
`because`, `although`, `unless`, `while`, `than`, `since` and `nor` give the same `'n boek 'n motor`.

**Tag.** Wait. Fix it before M4's equivalence suite pins this behaviour in two back ends.

###### F2 · A capital letter changes or stops the translation · High

**What we saw.** `apply_name_literals` decides what a capitalised token is. A sentence-initial token with any exact-case entry keeps that entry (`engine.cpp:84`). The store holds `A` as a noun (`data/languages/eng/dictionary/a.yaml:2`), so `A` is never the article. A sentence-initial token whose lower-case form is only a noun becomes a name (`engine.cpp:91`). Any capital after the first word becomes a name whatever the dictionary holds (`engine.cpp:79-82`). ADR 0025 leaves a placed name unmarked, so the English word comes back with status `ok`. `is_capitalised` tests ASCII only (`engine.cpp:44-46`), so `Émile` takes the other path and is marked.

**Why it matters.** A user types an ordinary English sentence with a capital first letter. `a book` gives `'n boek`. `A book` gives `boek van A`, "book of A", with exit 0. No golden row can see this, because every fixed-set input starts in lower case except the names.

**Input.**
```
$V "A book"          exit=0  boek van A
$V "All the books"   exit=0  finaal boeke
$V "Car"             exit=0  Car          ("car" gives motor)
$V "Cars"            exit=0  Cars         ("cars" gives motors)
$V "Children"        exit=0  Children
$V "The Book"        exit=0  Book
$V "the Car"         exit=0  Car
$V "HELP"            exit=0  HELP
$V "Xyzzy"           exit=0  Xyzzy        ("xyzzy" gives ⟦xyzzy⟧, exit 2)
$V "Émile"           exit=2  ⟦Émile⟧
```
Issue 196 sent no test-writer, so its tests landed green in `ee6d3c1`.

**Tag.** Wait. The fixed set is lower case by source.

###### F3 · Plurals of M5 and M17 nouns stay singular · High

**What we saw.** Rule 227 calls `inflect` for each noun with a paradigm. `is_unsupported_affix` refuses comma lists and duplication (`engine/src/rule_interpreter.cpp:670-680`). `inflect` then returns the base form and appends nothing (`rule_interpreter.cpp:840-843`). `inflect_node` sees an empty scratch trace and moves on (`generation.cpp:477-483`). The trace shows `afr-gen-227` with no `afr-inf-` entry and no `unsupported` entry. M5 is `PLR:=[-2]:"",0>"e"` and M17 is `PLR:=[-1]+,>"e"`. ADR 0021's list of unsupported shapes names no a-rule shape.

**Arithmetic.** M5 has 1,082 lemma records and M17 has 1,370, so 2,452 of the 22,077 lemma records with a `PAR` value, or 11.1 percent. I counted these from the shards.

**Why it matters.** A user translates `the cities` and gets `die stad`, "the city". The number has changed, the exit code is 0, and even `--trace` does not show the skip.

**Input.**
```
$V --trace "cats"    1 72 62 afr-gen-56 afr-gen-227 / kat   exit=0
$V "the cities"      exit=0  die stad
$V "knives"          exit=0  mes
$V "attacks"         exit=0  aanval
$V "shares"          exit=0  aandeel
```

**Tag.** Wait. No fixed-set row uses M5 or M17.

###### F4 · A missing or corrupt grammar file gives status `ok` · High

**What we saw.** `read_grammar_file` returns an empty list for a missing file (`rule_interpreter.cpp:140-145`). The line reader skips what it cannot read, so random bytes also give an empty list. `RuleSet::load` has no failure value (`rule_set.hpp:12-15`), and `Engine::load` has no failure path (`engine.hpp:108`). `Engine::translate` runs with whatever arrived.

**Why it matters.** A deployment copies `data/languages/afr` and loses `generation.yaml`. Every article and plural vanishes from then on. Each answer is exit 0 and looks like Afrikaans. An operator has nothing to alert on, and the fault shows only when a reader complains.

**Input.** I compiled `apps/cli/src/main.cpp` with `VERSTAAN_REPO_ROOT` set to a scratch tree, then removed or damaged one file at a time.
```
variant                                    input              result
afr/grammar/generation.yaml removed        the book           exit=0  boek
afr/grammar/generation.yaml removed        books              exit=0  boek
afr/grammar/generation.yaml empty          books              exit=0  boek
afr/grammar/generation.yaml 20 KB random   books              exit=0  boek
eng/grammar/analysis.yaml removed          a book in a box    exit=0  boek boks
eng/analysis.yaml cut with head -n 300     a book in a box    exit=0  boek boks
afr/grammar/inflection.yaml removed        books              exit=0  boek
both stores removed                        a book             exit=2  ⟦a⟧ ⟦book⟧
```

**Tag.** Wait. The fix needs a decision on how `load` reports failure, and that touches the public API, so it needs an ADR.

###### F5 · The rule cap changes the text with status `ok` · Medium

**What we saw.** `kTreePassRuleCap` is per rule, per pass, and `translate` runs the whole input as one forest. No step splits the input into sentences. After 1,024 firings the rule retires (`engine/src/tree_pass.cpp:519-522`, `generation.cpp:930-933`) and `analyse_tree` still returns `ok` (`tree_pass.cpp:609`). ADR 0017 chose that status for the tree pass, so the sign exists only with `--trace`.

**Why it matters.** A service sends a long document as one call. Up to word 1,024 the plurals are right. After that they are singular, with exit 0.

**Input.**
```
$V --trace "books books ... " (1,100 times)
exit=0  152.2 s  flags: 1 capped, 72 capped, afr-gen-56 capped, afr-gen-227 capped
words=1100  boeke=1024  boek=76
```
1,024 + 76 = 1,100.

**Tag.** Wait.

###### F6 · The engine and the validator read different YAML · Medium

**What we saw.** The C++ reader is not a YAML parser. It expects eight fixed lines per dictionary entry (`engine/src/dictionary_lookup.cpp:266`) and seven per rule (`rule_interpreter.cpp:117`). It handles only double quotes (`dictionary_lookup.cpp:119-125`, `rule_interpreter.cpp:99-105`) and only one-line flow maps (`dictionary_lookup.cpp:317`). `tools/validate` reads real YAML. So a store that passes the validator can read differently in the engine. A record with a missing field is caught by the validator, but the engine then swallows the next record with no trace. `split_inflection_branches` emits a branch only at a `;` (`rule_interpreter.cpp:771-786`), so a last branch with no `;` is lost.

**Why it matters.** In M4 the compiler reads the store in Python. A rule-author saves one rule with single quotes, which is valid YAML. The compiled back end fires it, the runtime back end retires it, and the equivalence suite fails on a file the validator passed.

**Input.** `validate_store` ran on a small copy of each variant. Each copy also gets one artefact error, `iso3 'eng' is not the store folder`, from its scratch folder name. The clean baseline has that same error.
```
variant                                validator                 engine
dictionary: features in block form     passes                    a book   exit=0  boek
dictionary: headword 'book' in ''      passes                    a book   exit=2  ⟦book⟧
afr-gen-35: lhs in single quotes       passes                    the book exit=0  boek  (afr-gen-35 unsupported)
M3: no trailing ;                      passes                    books    exit=0  boek
afr-gen-34: comment line removed       error, comment required   the book exit=0  boek  (rule 35 gone, no trace)
dictionary: priority line removed      error, priority required  box      exit=2  ⟦box⟧ (next entry swallowed)
```
A real shard parsed clean on every field count: eng 576,885 and afr 30,844 for all eight fields, and no single-quoted scalar anywhere. So no shipped data hits this today.

**Tag.** Wait, as a quest before the M4 compiler.

###### F7 · A14 and A15 cannot pass as written, and issue 201 is still open under M3 · Medium · blocks the tag as a ruling

**What we saw.** M3's fixed set has 15 rows. 13 match. A14 and A15 are `deferred: 201`, and issue 201 has `milestone: M3`, `status: open`. Issue 188's `depends_on` leaves it out, so `m3` would be tagged with an M3 issue open. The rows also conflict with later rulings.

- **A14** (`tests/fixtures/languages/eng/tests/basic.yaml:133`) expects `'n kar, ...`. ADR 0023 line 56 says the rule yields `motor` and "the owner has not ruled on A14". Issue 201 still requires `'n kar`.
- **A15** (`basic.yaml:143`) expects `⟦Paris⟧`, and issue 201 requires UW `500003943`. `engine.cpp:79-82` makes any non-initial capital a quoted literal, and ADR 0025 leaves a placed literal unmarked. A09's `Geneva` was ruled that way.
- **A15** also expects `prente`. Issue 201's own text records that the engine picks `skilderye`.

**Why it matters.** Issue 201's implementer builds the scope and A14 reaches `'n motor, 'n boek en 'n beker`. The row still differs by one word, so `deferred` never comes off, and the quest cannot close without a lexical special case or a new ruling.

**Input.**
```
$V "a car, a book and a mug"   exit=0  'n motor 'n boek en 'n beker
$V "pictures and photos"       exit=0  skilderye en foto's
```
At `d4ca9ae`, with no deferred key honoured for the row, A15 printed `actual: mooi boek die stad Paris skilderye foto's in die tafel`.

**Tag.** Block on three owner answers: `kar` or `motor` for A14, `⟦Paris⟧` or `Paris` for A15, and which milestone holds issue 201. No code is needed.

###### F8 · Cost has no bound · Medium

**What we saw.** Each firing copies the whole forest (`tree_pass.cpp:497`, `generation.cpp:791`) and rescans from rule 1. ADR 0017 accepts this cost for runtime tables. `collect_disambiguation_deletions` also enumerates every reading combination before it tests any (`rule_interpreter.cpp:564-595`). `cut` has 224 readings, so a width-3 D-rule visits 224³ = 11,239,424 combinations per window. `translate` also reopens the dictionary on every call (`engine.cpp:176`, `engine.cpp:211`).

**Why it matters.** The `connected` tier takes text from a caller. Five thousand repeats of `the`, about 20 KB, hold one core for over two minutes and return nothing.

**Input.**
```
"the" x 5000       exit=0  132.9 s  (empty text)
"books" x 400      exit=0   26.8 s
"cut" x 3          exit=2    0.78 s
"cut" x 60         exit=2   64.5 s
"xyzzy" x 20000    exit=2    0.8 s
one 120 KB token   exit=2    0.0 s
```

**Tag.** Wait, with M4's Pi budget work. Those runs were on this desktop in a release build, and the Pi will be slower.

###### F9 · Docs and code disagree · Medium

**What we saw and the input.**

- **I/O.** `engine/CLAUDE.md:7` says "`src/` is the core. No I/O". `engine/src/dictionary_lookup.cpp:36` and `engine/src/rule_interpreter.cpp:34` open files with `std::ifstream`, and `Engine::translate` reads the store on every call. Scene: M4's basic tier must not allocate after load (SPEC §3.4), and today `load` reads no dictionary at all.
- **`not_implemented`.** SPEC §3.4 calls it "the M0 stub value every real `Engine` method retires". `engine.cpp:164-167` still returns it for afr to eng and for any register or context. SPEC §3.6 advertises `--register formal`. `$V --register formal "a book"` prints a blank line and exits 1. SPEC §3.6 lists exits 0, 2 and 3 only.
- **Unknown flag.** `$V --bogus "a book"` gives `'n boek ⟦--bogus⟧`, exit 2. `apps/cli/src/main.cpp:142-147` treats any unknown flag as text.
- **`meta.yaml` counts are stale.** SPEC §3.3 says `counts` come from `tools.importer.meta`. The validator requires the key but does not compare it with the store.
  ```
  key                         meta.yaml   store
  eng rules_analysis          182         183
  eng rules_disambiguation    5           10
  eng dictionary_entries      576884      576885
  afr rules_generation        234         236
  ```
- **SPEC §3.3 row keys.** The list omits `id`, `status`, `review` and `source`. The fixture file's own header admits the addition.
- **Issue 183.** It has `status: done` with two unchecked Done-when boxes. One names `ctest -R pipeline_fixed_set`, and `d8a8452` deleted that test.

**Tag.** Wait, one docs quest. The `meta.yaml` counts are one command to fix.

###### F10 · Decisions with no ADR · Medium

ADRs 0017 to 0026 do not cover these.

1. **Who is a name** (`engine.cpp:44-98`): the noun-only test, the hard-coded `"I"`, and the ASCII capital test. Issue 196 states part of it, and the noun-only test appears only in code. ADR 0025 uses the result and does not decide it. See F2.
2. **The bare `TEMP` tag on every name literal** (`engine.cpp:127`). No ADR names it.
3. **The engine reads the store during `translate`**, with `RuleSet` carrying the store roots (`rule_set.hpp`, `engine.cpp:176`). Against `engine/CLAUDE.md:7`, see F9.
4. **The fixed-line reader in place of a YAML parser.** ADR 0020 records it as a fact and does not choose it. See F6.
5. **The a-rule shapes `inflect` refuses silently** (`rule_interpreter.cpp:668-680`). See F3.
6. **"An ADR guards a change to the public API, not every addition"** (`dictionary.hpp:6`, `rule_set.hpp:5`). `engine/CLAUDE.md:6` says "Changing it needs an ADR". Three new public headers rest on this comment.

ADR 0026 stays `Proposed`, and issue 201 waits on the owner. That is correct as filed.

**Tag.** Wait. Write each ADR with the quest that touches the code.

###### F11 · The golden loader drops a row with no `id` and reads one copy of the rows · Low

**What we saw.** `runs_in_engine` needs an `id` (`tests/golden/row_loader.hpp:132`), and `skipped` also drops an empty `id` (`row_loader.hpp:148`). The row is neither run nor counted. The loader reads `tests/fixtures/languages` only (`row_loader.hpp:165`), so `data/languages/eng/tests/basic.yaml` is an unread twin. Today the two agree on `id`, `input`, `expected`, `status` and `deferred`.

**Why it matters.** A rule-author at M6 types `ids:` for `id:`, or adds a row to the store copy. The gate stays green and the row never runs.

**Input.** I compiled `tests/golden/loader_test.cpp` against a scratch root with three rows, two of them with no `id` and with wrong expected text.
```
--gtest_list_tests:  Table/golden_row.  Row/A01
```
One row listed, and the two wrong rows produced no report. The run also prints gtest's uninstantiated `skipped_row` failure, because the scratch root has no xxa/xxb rows. That failure does not occur in the repo.

**Tag.** Wait.

###### F12 · A D-rule reads an unreadable test as true and ignores its right side · Low

**What we saw.** ADR 0017 rejected guessing, and it covers the tree pass and, through ADR 0021, generation. D-rules go through the older flat parser (`rule_interpreter.cpp:268-294`). A quoted regex there is an ordinary tag no reading carries, so `^"/zzz/"` is always true. `apply_disambiguation_rule` never reads `rule.rhs` (`rule_interpreter.cpp:599-628`). No shipped rule has either shape. I read all 23 D-rule left sides, and every right side is `"0"`.

**Why it matters.** The first imported D-rule with a regex deletes the readings it was meant to spare.

**Input.** Scratch store, `eng-dis-1` edited.
```
([in],^"/zzz/")(POS=ART,#PREFERRED) = 0     a book in a box   exit=0  'n boek aan 'n boks
([in],POS=PRE)(POS=ART,#PREFERRED)  = 255   a book in a box   exit=0  'n boek aan 'n boks
```
The unedited store gives `'n boek in 'n boks`.

**Tag.** Wait.

###### F13 · Byte-level text handling · Low

**What we saw.** `apply_affix` counts bytes (`rule_interpreter.cpp:743-756`). The tokeniser knows ASCII space and ASCII `'` only (`engine/src/tokeniser.cpp:16-30`). Neither validates UTF-8, so invalid bytes reach `text`. `Status` comes from a search for `⟦` in the final text (`engine.cpp:225`), so an input mark counts as a fall-through mark.

**Why it matters.** The first Afrikaans lemma with a non-ASCII tail under a cutting paradigm sends a broken string to a JSON consumer.

**Input.**
```
scratch store: négligé on PAR M3, M3 changed to PLR:=1>"e"
                         housecoats       exit=0  néglig\xc3e
$V "a<U+00A0>book"       exit=2  ⟦a book⟧
$V "a book’s"            exit=2  ⟦book’s⟧
$V $'\xff\xfe'           exit=2  ⟦\xff\xfe⟧
$V "⟦x⟧"                 exit=2  ⟦⟦x⟧⟧
```
No shipped lemma reaches the byte cut. Of the non-ASCII tails under M20 and M24, the eight I sampled were plural forms with an ASCII `BF`, and lexical choice drops those records.

**Tag.** Wait.

##### Check 2: gates, per issue

Issues whose `agents:` includes test-writer: 26, 180, 181, 182, 194, 195, 198, 199. Each has `test(#NN)` before its work commit.

| Issue | test commit | work commit |
|---|---|---|
| 194 | `68f4520` | `5ecee6e` |
| 195 | `86db645` | `5e91048` |
| 180 | `df78379` | `e71100b` |
| 198 | `ce04a24` | `7a69eef` |
| 181 | `4dcc49e` | `fc46e45` |
| 199 | `ce2ca32` | `8713df6` |
| 182 | `fbcd4a7` | `676b19e` |
| 26 | `d4ca9ae` | `d8a8452` |

I built and ran four at their test commit. Each build exits 0, and each suite exits 1.

| Issue | Commit | Suite | Result |
|---|---|---|---|
| 194 | `68f4520` | `tree_pass` | 47 of 47 fail |
| 181 | `4dcc49e` | `generation` | 31 of 32 fail. `N50_lookup_uw_finds_nothing_for_an_unknown_or_empty_uw` passes on the empty stub, as a negative test can. |
| 26 | `d4ca9ae` | `golden_tests` | `red_row_altered_A02_L3` fails on purpose, `die BOEKIE` against `die boek`; 15 rows pass. `d8a8452` removes that row. |
| 199 | `ce2ca32` | whole `verstaan_tests` | 46 fail, 220 pass, including K01 to K09 |

`d8a8452` edits test paths, and `d4ca9ae` precedes it, so that is no finding.

Noted, no finding by this check's rule: issues 19, 20, 22, 23 and 196 are engine issues whose loadouts sent no test-writer, so their tests landed green in the work commit. `docs/standards/testing.md` line 41 says engine-core tests come first. F2 sits in one of those issues.

##### Checked and clean

- **Generated and archive paths.** `git diff --name-only m2...3024be9 -- engine/generated data/archive` lists 0 files.
- **Generated includes.** No engine, CLI or test source includes a generated file. `grep generated/` finds only a comment and a path check.
- **Personal data.** No credential, e-mail address or owner name in the added lines, `CONTRIBUTORS.md`, `data/archive` and dictionary shards excluded from the name scan.
- **`source` on store records.** Field count equals record count on every dictionary shard set, grammar file, corpus (248 of 248 in each language) and `eng/tests/basic.yaml` (15 of 15).
- **Licence line.** Present on every grammar, test, meta, tagset and corpus file.
- **Empty UW.** Every empty-UW entry has `LEX` of `C`, `D` or `P`, as SPEC §3.2 says. eng: 168, 309, 634. afr: 117, 14, 99.
- **Rule shapes.** Unbalanced `(N`, `(+Z`, `N(%x)`, empty lhs and rhs, `()`, and `/[/(%x;%y)` retire or cap with no crash. Exit 0, text `'n boek`.
- **Endless rules.** A pair that undo each other stops at 1,024 firings each, and a rule that adds a node per firing also stops. No hang.
- **Empty input.** `""` and `" "` give exit 3.
- **Odd feature values.** `{}`, an unterminated `{`, and an unterminated `"` all return without a crash. The word loses its features, and `a book` gives `boek`, exit 0. The validator rejects all but `{}`, so F6 covers that path.
- **Out-of-range indices.** `read_graph` and `analyse_tree` check `readable` first, and `start_state` skips an out-of-range relation. I read these. Rows T18 and T19 test the forest case. The C++ harness for this was refused by the session's command guard, so I did not run my own input.
- **Thread safety of `translate`.** It holds a read-only `RuleSet`, and each call builds its own `Dictionary`. I read this and did not run it, for the same reason.
- **Arithmetic.** ADR 0026's Relation size holds: 32 + 8 + 8 = 48 bytes, and a `uint16_t` pads to 56.
- **SPEC §3.4.** The API shape, `Result`'s four fields, `Status`'s four members and `TraceEvent` match `engine.hpp`.
- **`Engine::generated`.** It returns `not_implemented` as M3 promises.

##### What I tried to break and could not

No input crashed a binary. That covers long tokens, 20,000 unknown words, invalid UTF-8, malformed rules and missing stores. The findings above are wrong answers with a clean exit, not crashes.
