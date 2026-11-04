# 0028 — Generated tables hold rule text and dictionary rows, and git holds only the fixture and basic

Date: 2026-11-04 · Status: Accepted

## Context

The compiler is a skeleton, and `Engine::generated` is a stub. Nothing says what a generated table
holds, which words a tier keeps, or what a pull request compiles. Quests 29 to 32 and 203 wait on
those answers. This ADR records six decisions, because each one changes what the others cost.

### How these figures were taken

A prototype emitter read the real stores and wrote tables in the form decision 4 adopts. It lived in a
scratch folder and is not in the repository. A scratch harness linked `libverstaan_core.a` from the
`linux-gcc` preset and counted every `operator new`. The machine is this desktop: x86-64, 8 cores,
15 GB, GCC 16.2.1, Clang 23.1.3, `-O2`. The other sessions on the desktop held about 11 GB.

Each figure below is marked. **Measured** means this run produced it. **Estimated** means it is
worked out from measured figures, and the row says how. The byte counts come from the prototype,
so quest 29's compiler can move them. Quest 29 states its own figures in its hand-off.

The stores, as read on 2026-11-04:

| Figure | eng | afr |
|---|---|---|
| Entries | 576,885 | 30,844 |
| Headwords | 234,591 | 9,469 |
| Distinct UWs, without the empty one | 108,930 | 9,679 |
| Entries at the most common `frequency` | 377,534 at 1 | 11,497 at 2 |
| Entries at the cap of 255 | 1,257 | 11 |
| Closed-class records (empty UW) | 1,111 | 230 |
| Closed-class records at `frequency` 0 | 64 | 226 |
| `id` values held by more than one entry | 188,907 | 12,965 |
| Groups of entries that differ only in `source` | 1,051 | 4,355 |
| Partner headwords (defined in decision 2) | 25,512 | 9,378 |
| Capitalised headwords (defined in decision 2) | 10,575 | 1,089 |
| Partner headwords no pin holds | 25,026 | 8,266 |

### Owner rulings, 2026-11-04

The owner accepted this ADR on 2026-11-04. The checkpoint 4 read of its first draft brought R1 to R4.
The owner gave R5 to R9 on the corrected draft. Each one is carried into the decision it changes.

| Ruling | Text | Carried in |
|---|---|---|
| R1 | `basic` keeps every capitalised headword. | Decision 2 |
| R2 | The real-compile list holds both runtime store readers as well as the table reader. | Decision 3 |
| R3 | If MSVC fails on `basic`, its leg builds the fixture only. | Decision 3 |
| R4 | `connected` at M4 is every store's dictionary and rules, with no corpus table. | Decision 4 |
| R5 | Partner headwords rank above frequency, and `n` is 30,000. | Decision 2 |
| R6 | A sentence-initial capital whose lower-case word `basic` cut stays a known exception to "a loss means partial". No quest closes it. | Decision 2, rows T105 and T106 |
| R7 | Git holds `fixture` and `basic`, at about 4 MB for each dictionary change that adds an eng string. | Decision 4 |
| R8 | ADR 0003 narrows: `phone` and `connected` build only with Python. | Decision 4 |
| R9 | "No allocation after load" covers table reads, and `translate` still allocates its working state. | Decision 5 |

## Decision 1: Rule text in tables

`rules.cpp` holds each rule's text as one row: `{id, kind, lhs, rhs, comment}`, byte for byte as the
store holds it. It holds one array per language and grammar file, each in file order. The array, not the
row, says which list a rule belongs to. `kind` cannot say it, because 344 rows of `generation.yaml` and
322 of `analysis.yaml` read `default`. An id cannot say it either, because 356 `(file, id)` pairs repeat
across eng and afr.

`Engine::generated` reads those arrays into `RuleSet`'s seven lists and runs the same `RuleInterpreter`.
Each rule's text is parsed once, at load. The compiler generates no rule code. It writes no function per
rule.

The mechanism carries ADR 0007's identical-trace demand. Both back ends run one parser, one first-match
loop, one rule cap and one trace writer. Only the source of the bytes differs. A trace can differ only when
a reader hands over different bytes, and block T tests the readers.

| Cost | Rule text in tables | Rule code per rule |
|---|---|---|
| Rows or functions | 888 rows, 76,713 bytes of source, measured | 888 functions, counted from the same rows |
| Code that must agree with the runtime path | The table reader | `tree_pass`, `generation`, `rule_interpreter`, `tree_syntax`: 3,250 lines, measured with `wc -l` |
| Parse cost | 12,230 allocations and 2.3 ms for the analysis and generation rules, measured, once per load after this ADR | None |
| Compile cost | Under 0.5 s, measured | Not measured, because no generator exists |

Rule code must also reproduce what the runtime path does with a rule it cannot read. The pass writes an
`unsupported` trace entry and retires that rule (ADR 0017). `afr-gen-61` does this across the 248 corpus
sentences today. A generator would have to emit that event as behaviour, and each new rule form would need
the same change in two places.

Speed is the cost. The owner asked for rules "embedded and part of the source code so it can really be as
fast as C++ can deliver" (ADR 0007). Rule text in a table is embedded, and it still matches through parsed
patterns at run time. But the gain from per-rule code is small today. On the longest fixed row, A15, a pair
of stores cut to 1,755 entries still takes 19 ms and 134,842 allocations, measured. The firing loop copies
the whole forest for each firing (ADR 0017, quest 212), and rule code would not change that.

**Rejected: rule code per rule.** It buys a matching speed-up that no measurement has yet shown to matter.
It pays with a second implementation that the equivalence suite must then keep level. Reopen this if quest
205's Pi run or quest 212's cost work finds matching itself is the bound.

### How the engine reaches a table

`engine/include/verstaan/generated_tables.hpp` holds the row structs and declares one function:
`const GeneratedTables& generated_tables();`. It is MPL-2.0 and names no language data. The data library
implements that function, so `tables.cpp` includes the engine's header. The dependency runs from data to
engine, as ADR 0003 requires. No engine source includes anything under `generated/`, and quest 206's lint
holds that.

`Engine::generated` sits in its own source file in `verstaan_core`, and it is the only caller of that
function. A static archive pulls a member only when a symbol needs it. So a binary that never calls
`Engine::generated` pulls no such object and needs no data library. `apps/cli/CMakeLists.txt:17` and
`tests/CMakeLists.txt:17,37,45` link only `verstaan_core`, and they keep linking that way.
`tests/unit/engine_test.cpp:13` calls `Engine::generated` today, so quest 30 changes that test or links the
fixture library to `verstaan_tests`.

One binary links one data library. `Engine::generated(Tier)` serves the tier its binary linked. The fixture
library answers `Tier::basic`, so `Tier` gains no test-only member. Asking for any other tier is a load
failure, in the form quest 210's ADR gives. It does not return `not_implemented`: `engine.hpp:40` calls that
value a stub every real method retires, and gate step 0 refuses the word in `engine/src`.

## Decision 2: Top-N counts whole headwords, partners first

`n` in `tiers.toml` counts ranked headwords per language. The compiler first sets aside the **pins**. They
are always kept, they take no ranked place, and the kept count passes `n` by their number:

- **Closed-class:** every headword that holds a closed-class record.
- **Fixed-set:** every headword a fixed-set row needs. A fixed-set row is a row with `tier: basic` in
  `data/languages/<iso3>/tests/`. For each token of its `input`, the pin holds the token and the token with
  its first letter in lower case, which is the engine's retry for a sentence-initial capital. A row with
  `deferred` pins like any other. The compiler reads no other test file.
- **Capitalised (owner, R1):** every capitalised headword.

A headword is **capitalised** when its first character has the Unicode general category `Lu` and it holds no
space. The engine's test today is narrower: first byte `A` to `Z` (`is_capitalised`, `engine/src/engine.cpp:44`).
Two eng headwords lie between the two tests, `Śīla` and `Áine`, with 4 entries. Quest 207 removes the ASCII test,
and it lands before quest 29, so the pin uses the wider test now and quest 207 keeps the two in step. A pin only
adds a word, so the wider test cannot change a word's reading. The tests apply to a whole headword:

| Headword | Capitalised | Why |
|---|---|---|
| `German`, `Áine` | Yes | First character is `Lu` |
| `Anglo-Saxon`, `John's` | Yes | A token can hold a hyphen or an inner apostrophe |
| `New York` | No | The tokeniser splits at the space, so no token can reach it |
| `iPhone` | No | First character is lower case, and the engine reads it as ordinary |

The compiler then ranks the remaining headwords by this key, and keeps the first `n`:

1. A **partner headword** comes first. A partner headword has at least one entry with a non-empty UW that is
   also a UW in the other language of the pair. An empty UW marks a closed-class record and is no link.
2. Then the headword's highest `frequency`, highest first.
3. Then the headword's UTF-8 bytes, lowest first.

A headword is unique within a language, so the key is a total order. No further tie-break exists or is
needed. A kept headword keeps every entry, in store order, duplicates included. The compiler fails, and writes
nothing, when `n` is below a language's count of partner headwords that no pin holds. The message names the
language and both numbers.

`basic` sets `n = 30000`. That keeps 41,036 eng headwords (175,536 entries) and all 9,469 afr headwords (30,844
entries). The tie-break matters less than it first appears, because the cut lands at `frequency` 19, in a class
of 288 partnerless headwords. Under frequency alone, a cut past 73,211 headwords lands in the class of 161,047
at `frequency` 1.

### Why capitals are pinned

The engine treats a capitalised word with no entry as a name, and a name shows bare (`engine.cpp:79-92`). So a
cut changes the answer, and the change hides the failure. Scene: a user on `basic` types `German`. The first
draft's cut had removed its entry, so the engine answered `German`, exit 0. The full store answers `⟦German⟧`,
exit 2, because `German` has a record and no afr word. Quest 207's ruling spreads this to every position: "A
capitalised word with no record is a name, and shows bare." Quest 208's ruling is that a loss means partial. The
pin holds the record, so `German` stays marked on both.

The pin holds records. It cannot hold a word that has none in capitals. `Slumbrous` has no capitalised entry, so
the engine retries `slumbrous`, which `basic` does not hold. It then shows bare, exit 0, where the full store
gives `⟦Slumbrous⟧`, exit 2, measured. Closing that gap means keeping every lower-case word. The owner accepts it
as a known exception (R6). T105 and T106 record what each tier gives.

### Why the unit is the headword

The engine takes the first surviving candidate of a word, in store order. Lexical choice takes the highest
`priority`, then store order (ADR 0023). So an entry-level cut changes what a kept word means, and nothing reports
the change.

The scene: the entry-level run answers `any book` with `boek`, status `ok`. `any` is gone. The same run answers
`love symbol` with `teken van liefde`, where the full store gives `Simbool ⟦love⟧`. It reports 117 `ok` rows on
the corpus against the full store's 102, so a status count reads it as an improvement. Neither change is a choice
anyone made. The cut made both, because it removed the sense that stood first.

Selection therefore delivers one promise: **a kept word keeps its entries and their order.** It does not promise
that a kept word's text matches the full store's. A dropped neighbour can still change it, because the rules see
fewer features around the kept word. These results are measured, and each differs from the full store with the
kept words intact:

| Input | Full store | `basic` | Dropped word |
|---|---|---|---|
| `a group of friends` | `⟦group⟧ ⟦friends⟧` | `kennis ⟦group⟧` | `group` |
| `a very slumbrous book` | `'n boek ⟦slumbrous⟧` | `⟦very⟧ boek ⟦slumbrous⟧` | `slumbrous` |

`Atlantic Ocean` differed before R1, as `Ocean ⟦Atlantic⟧`. The capital pin keeps `Atlantic`, and it now gives
`⟦Atlantic⟧ ⟦Ocean⟧` on both, measured.

All runs below used the runtime back end on a filtered store, over the 248 `ugoa1` sentences and the 15 fixed
rows. "Pins" means closed-class and fixed-set, and "capitals" adds R1. Every figure is measured.

| Selection | eng entries | Corpus text or status differs from the full store | Fixed rows whose text differs | `ok` rows on the corpus, full store 102 |
|---|---|---|---|---|
| Entries, frequency only, no pins, 50,000 eng and 20,000 afr | 50,000 | 89 | 5 | 88 |
| Entries, frequency only, pins, afr whole | 50,240 | 53 | 0 | 117 |
| Headwords, frequency only, pins, capitals, afr whole, `n` 30,000 | 185,852 | 8 | 0 | 100 |
| Headwords, partners first, pins, no capitals, afr whole, `n` 30,000 | 152,131 | 6 | 0 | 102 |
| **Headwords, partners first, pins, capitals, afr whole, `n` 30,000** | **175,536** | **5** | **0** | **102** |

An entry-level cut at 50,000 changes the first sense of 8,725 of its 20,740 headwords, measured. An entry-level
cut of afr at 20,000 keeps 4 of its 230 closed-class records and loses 3,790 of 9,679 UWs, measured. `die` and
`'n` sit at `frequency` 0, so they are the first words to go.

### Why partners come first

A word with no partner has no Afrikaans word to give. The engine marks it `⟦word⟧` whether the table holds it or
not, unless it is capitalised, which the pin handles. Dropping one can still move its neighbours, as the table
above shows. Frequency alone at `n` 30,000 keeps 12,389 partner headwords. Partners first keeps all 25,512, for 6%
fewer entries.

### Why `n` is 30,000

The first draft ranked every headword, so capitals took ranked places. Now they take none, and the same `n` keeps
more. 25,026 partner headwords stand outside the pins, so that is the lowest `n` the compiler accepts. All rows
keep the pins. Every figure is measured. Rows other than 30,000 used the `A` to `Z` capital test, 4 entries fewer.

| `n` | eng entries | Corpus text or status differs from the full store | Graph or trace differs | `ok` rows |
|---|---|---|---|---|
| 25,026, the lowest the compiler accepts | 152,696 | 34 | 48 | 102 |
| 25,100 | 153,059 | 7 | 9 | 102 |
| 26,000 | 158,369 | 7 | 9 | 102 |
| 28,000 | 167,227 | 6 | 8 | 102 |
| **30,000** | **175,536** | **5** | **7** | **102** |
| 35,000 | 195,359 | 5 | 7 | 102 |
| 40,000 | 212,861 | 5 | 7 | 102 |

The partner set alone is not enough. The first 74 partnerless headwords cut the differences from 34 to 7. They sit
at `frequency` 235 and above, and they are mostly pronouns: `he`, `my`, `anybody`. They hold a UW with no afr word, yet
they still carry features, so the rules place them. The differences reach their floor at 30,000 and stay at 5 to 40,000. Those 5 hold
`two`, `group` and `translation`, which rank low and have no partner, so only a far larger `n` would reach them.

30,000 stays the value. It sits at the floor, and it leaves 4,974 places above the partner count, so the afr store
can grow before the compiler stops a build. 26,000 would save about 2 MB of read-only bytes, estimated from the
table, for 2 more differences and 974 places. The budget does not force that saving.

The failure below the partner count protects lexical choice. Suppose a cut removes `motor` and keeps `kar`. Then ADR
0023 picks `kar` with no report, against the owner's ruling on `motor`. With every partner headword kept, every entry
a generation pass can reach through a UW is in the table.

**Rejected:**

- **`id` as a tie-break.** 188,907 eng ids sit on more than one entry.
- **Store order as a tie-break.** It favours `a` over `z` at the cut, as bytes do, and it also moves when an importer
  reorders a shard.
- **A hash of the headword.** It removes the alphabet bias, but a reader can no longer predict a cut by eye. The cut
  lands in a small class, so the bias is small.
- **A hand-kept word list.** It would drift from the rows it serves.
- **Raising `frequency` in the store.** The field is archive data, and ADR 0023 refused the same move on `priority`.

**SPEC §7's wording changes.** "Top-N by frequency" becomes "top-N headwords, partners first". This goes beyond the
tie-break the issue asked for, so the owner ruled on it (R5).

## Decision 3: A pull request compiles the fixture pair

Every branch compiles `[fixture]` in `tiers.toml`, the xxa/xxb pair. A branch compiles the real stores only when it
changes a path under `[real_stores].compile_when_changed`. The compiler decides this itself, with the same flags
`tools.validate` takes:

```
python -m tools.compiler --changed --base <ref>
```

A `<ref>` that does not resolve fails the command. It must not read as "nothing changed", which is the trap
`tools/validate/cli.py:100-114` already guards against.

Gate step 6 runs that line, then checks that `git status --porcelain engine/generated/ tests/golden/` is empty.
`git diff --exit-code` is not enough. A generated file removed from git and written again is untracked, and `git
diff` exits 0 on it, measured. `gate.yml` runs the real store half in a `data` job, which the aggregator treats as a
pass when skipped.

The list holds these paths, for these reasons:

| Path | Why |
|---|---|
| `data/languages/`, `tiers.toml`, `tools/compiler/` | The input and the compiler |
| `engine/generated/basic/`, `tests/golden/basic/` | A hand edit of committed output must fail step 6 |
| `tests/equivalence/` | A branch that changes the suite needs the tier it diffs |
| `engine/src/dictionary_lookup.cpp` | The runtime reader for dictionaries (owner, R2) |
| `engine/src/rule_interpreter.cpp` | Holds `read_grammar_file`, the runtime reader for rules (owner, R2) |
| The table reader and `generated_tables.hpp` | Quest 30 adds them when it writes them (owner, R2) |

A reader decides which bytes a back end sees, so a change to one reader can part the two back ends. Quest 210
moves `read_grammar_file` out of `rule_interpreter.cpp`, and replaces that line with the new file. Until it lands,
every change to `rule_interpreter.cpp` compiles the real stores. Afterwards, interpreter changes stay off the list.
If quest 210 moves other store reading, it keeps the list true in the same commit.

This follows the 2026-09-16 brief's data-branch half. Issue 188's written "no" on carved fixtures stands: `ctest -L
fast` keeps reading the real store. This decision is about what the compiler reads.

| Work | Figure | Kind |
|---|---|---|
| Read the eng store with `yaml.CSafeLoader` | 226.6 s, under load from other jobs | Measured |
| Read the eng store with a fixed-line reader | 11.7 s | Measured |
| Emit `phone`'s tables after the read | 31.4 s | Measured |
| Compile the 148 KB fixture stores | Under 1 s, scaled from the fixed-line read | Estimated |
| Build `basic` in C++ on each leg, one file at a time | 13.3 s on GCC, 10.4 s on Clang, 708 MB at most | Measured |
| Build `basic` in C++ on MSVC | No figure. This machine has no MSVC | Not measured |
| The whole `data` job's compile and builds, on GCC | About 3 minutes | Estimated from these rows and decision 4's table |

| Branch changes | Python compiles | C++ builds | Step 6 checks | Equivalence |
|---|---|---|---|---|
| Docs, shared engine source, tests other than equivalence | fixture | fixture, basic | fixture | fixture |
| A path on the list | fixture, basic, phone, connected | all four | fixture, basic | fixture, phone |

The fixed-line reader carries the 11.7 s, and quest 211's ADR makes that format the store's contract. Quest 29 reads
the store that way, which is why it waits on quest 211.

**The gap this leaves.** A change to shared code, such as `generation.cpp` or `tree_pass.cpp`, skips the 248-sentence
diff. That is sound for one reason: shared code moves both back ends alike, so the diff would show nothing. A wrong
translation from such a change is the golden rows' to catch. It is not this suite's.

### If MSVC cannot build `basic` (owner, R3)

No figure exists for MSVC, and the owner ruled without one. Quest 29 is the first pull request to carry `basic`, so a
failure stops there. Quest 29 states the MSVC figure in its hand-off. If MSVC fails, by exhausting its heap or by
passing the job's 15-minute timeout at `.github/workflows/gate.yml:124`, then its leg sets `VERSTAAN_TIERS=fixture`.
The Linux legs still build `basic`.

The fixture has the same row structs and table reader, so MSVC still compiles and tests the whole table path. It
loses only the `basic` library and the golden rows on it, and those run on the Linux legs. ADR 0008 makes MSVC the
daily build and the matrix in `gate.yml` makes it a required leg. Both hold: the engine, the runtime back end and the
fixture build all still pass there. SPEC §7 targets `basic` at a Pi, so no shipped target loses a build. A Windows
machine that needs `basic` builds it by hand, and meets the same failure.

**Rejected:**

- **Compile everything on every pull request.** It adds about 3 minutes per leg, estimated from the rows above, for a
  docs branch that changed nothing they read.
- **Carved real-store slices.** The owner refused them in issue 188.

## Decision 4: Git holds the fixture and basic, one file per array

`engine/generated/fixture/` and `engine/generated/basic/` are committed, and so is `tests/golden/basic/` when quest 29
writes rows there. `phone` and `connected` are not, and `.gitignore` excludes `engine/generated/phone/` and
`engine/generated/connected/`.

Every tier and the fixture take one form. Each language gets its own four arrays, because 805 headwords sit in both
dictionaries, `die` among them, and a lookup must name its language. Each array gets its own file:

| File | Holds |
|---|---|
| `tables_<iso3>_pool.cpp` | The string pool, as `uint64_t` words |
| `tables_<iso3>_features.cpp` | The feature lists |
| `tables_<iso3>_rows.cpp` | Rows of byte offsets, in store order |
| `tables_<iso3>_index.cpp` | The headword index and the UW index |
| `rules.cpp` | One array per language and grammar file |
| `tables.cpp` | `generated_tables()`: the tier's name and pointers to the arrays |
| `tables.hpp` | The arrays' declarations, for these files only. No engine source includes it |

The compiler writes these on a clean checkout. For an uncommitted tier, the leg's usual CMake flags are added to the
second line:

```
python -m tools.compiler --tier phone
cmake -S . -B build -DVERSTAAN_TIERS=phone
```

CMake's configure step fails when a named tier's files are absent, and its message names the first command. It never
skips that tier, because a missing test looks exactly like a passing one (ADR 0013 records the same trap).

**Table files compile one at a time.** Each data library sets `JOB_POOL_COMPILE` to a pool of depth 1, across all
tiers. Ninja would otherwise run them together, and this desktop's other sessions already hold most of its 15 GB. One
compile peaks at 2,339 MB on GCC. Generators other than Ninja ignore the pool, and those are the MSVC legs that R3 covers.

**Golden rows follow the tier.** The compiler writes `tests/golden/<tier>/` only for a committed tier. `row_loader.hpp:168`
loads every `tests/golden/**/*.txt`, so rows for `phone` would change the test count on any tree that built it. They
would also dirty the tree that `git status --porcelain` checks. `phone`'s proof is the 248-sentence diff of decision 6.

**`connected` at M4 (owner, R4).** It holds every store's dictionary and rules, and no corpus table, because nothing
reads one yet. Corpora arrive when something does. Only eng and afr sit under `data/languages/`, so today its arrays
equal `phone`'s byte for byte, and only the header and tier name differ. It still gets its own `verstaan_data_connected`,
because one binary links one library and a service binary must link one that answers `Tier::connected`. The build adds
no test coverage today, and costs about 50 s on GCC in the `data` job only, estimated from `phone`. Its budget is
unbounded, so quest 32 records a figure and fails on nothing. T116 fails when the two differ, and Dutch at M6 is the
point that row must change.

All rows below use this form, one compile at a time. The prototype's indexes now hold real sort orders. The first draft
wrote placeholder orders, which compressed better than real ones and understated both packs.

| Tier | Rows | Source bytes | Git pack, first commit | Read-only bytes in the binary | C++ build, GCC | C++ build, Clang | Kind |
|---|---|---|---|---|---|---|---|
| basic, `n` 30,000 | 206,380 | 27,193,610 | 5,017 KB | 21.73 MB | 13.3 s, 708 MB peak | 10.4 s, 581 MB peak | Measured |
| phone | 607,729 | 89,206,126 | 16,148 KB | 69.57 MB | 50.4 s, 2,339 MB peak | 34.5 s, 1,854 MB peak | Measured |
| connected at M4 | As phone | As phone | As phone | As phone | As phone | As phone | Estimated, same stores |
| `rules.cpp`, within each row above | 888 | 76,713 | Not measured alone | 36 KB, plus 36 KB of pointer rows | Under 0.5 s | Under 0.5 s | Measured |

`phone` on GCC as one file failed at a 3.5 GB address-space cap in this test, at 30.8 s, measured. Split, its largest file
is 45.9 MB, and it passes under the same cap. That is why the form is one file per array. `basic` takes the same form so
one compiler path serves every tier, and its peak falls from 924 MB to 708 MB. Its total time rises from 11.8 s to 13.3 s,
because it now holds more rows.

The row shape decides how much git grows. Rows hold byte offsets into the pool, so those objects have no pointers to
relocate.

| One data change to committed `basic` | Pack growth | Diff lines | Kind |
|---|---|---|---|
| One `priority` value | 1 KB | 1 | Measured |
| One new eng headword early in the store | 3,932 KB | 411,205 | Measured |
| One new afr headword early in the store | 558 KB | 57,973 | Measured |
| One new eng headword, all three tiers committed | About 35 MB | About 3 million | Estimated from the row above and the phone pack |

A new string shifts every later offset in that language, so its four files change. Delta compression cannot help, and the
pack grows by nearly a full copy of them. The other language's files stay untouched. Five of 579 commits have touched a
dictionary shard (measured with `git log`), and the pack is 896 MiB today. At that rate the growth is bearable. Rule-only
changes touch `rules.cpp` alone, one line per rule. M5's management tools can raise that rate. The owner accepted this
cost (R7).

**Rejected:**

- **Commit all three tiers,** as ADR 0003 says. It adds about 35 MB per dictionary change that adds an eng string.
- **Commit none.** Then `basic` needs Python and a full store read on every leg, and a reader of the repository has no
  shipping tables to link. ADR 0003's reason still holds for the one tier that targets a Pi.
- **One `tables.cpp` per tier.** `phone` fails on GCC at the cap above, and any store change rewrites both languages.
- **Rows of string literals.** A diff stays one line, an estimate because its growth was not measured. But the first draft's
  prototype took 34.4 s and 2,467 MB on GCC. It wrote 32.85 MB of pointer rows into the data section. On a position-independent
  build the loader relocates those pointers, so they become private RAM inside basic's 64 MB.
- **One file per shard.** It limits a new string's cost to one shard. It also adds a second row-address form to the table
  reader, for a saving that 5 commits in 579 do not yet justify. Reopen this if the rate rises.
- **`#embed` or `.incbin`.** The compiler legs do not share either one. String literals in the pool hit MSVC's 65,535-byte limit,
  which is why the pool is numeric.

## Decision 5: "No allocation after load" covers the tables

`Result` does not change. After `Engine::generated(Tier::basic)` returns, no call allocates to read a
table. In detail:

- Tables are `static const` with constant initialisation. Load copies no dictionary row to the heap.
- Load parses each rule's text once and holds the parsed form. That heap use ends when load returns.
- A dictionary read returns views into that storage.
- `translate` opens no file, parses no rule text, builds no index and fills no cache.

`translate` still allocates its working state: the forest, the trace, `Result` and the candidate copies.
It frees all of that on return. SPEC §7's RAM budget bounds the peak, and quest 32 enforces it.

| Allocations in one `translate`, runtime back end today | Figure | Kind |
|---|---|---|
| `book` | 53,191 | Measured |
| A15, the longest fixed row | 225,439 | Measured |
| The 248 corpus sentences, largest | 395,978 | Measured |
| Parsing the analysis and generation rules, per call | 12,230 | Measured |
| Building the afr UW index, per call, because `translate` reloads the dictionary | 36,130 | Measured |
| One eng lookup of `book`, shard warm | 2,855 | Measured |
| `book` left for working state, once those three go | About 2,000 | Estimated by subtraction |
| A15 on a store cut to 1,755 entries | 134,842 | Measured |
| Process peak across the fixed rows on that small store | 5.7 MB | Measured, resident |

The table reads are 96% of `book` and can go to zero. A15's count is mostly working state, because each
firing copies the forest (ADR 0017). The 5.7 MB peak says working state fits beside 21.73 MB of tables
inside 64 MB, on x86-64 (ADR 0027).

Issue 188's finding B7 named the conflict: a strict reading means no allocation at all in `translate`. To
reach it, every `std::string` and `std::vector` in `Forest`, `Candidate`, `Trace`, `Graph` and `Result` needs an
arena or a caller buffer. The runtime back end runs the same code, so the change reaches authoring too.

**Rejected:**

- **`Result` with caller-owned buffers and an arena.** It changes the public API and the 3,250 lines of
  decision 1. Nothing measured says the budget needs it. The peak on the fixed rows is under a tenth of
  the budget. Long input is quest 212's bound, and quest 32 measures it against the budget.
- **Replacing `operator new` with a bump arena in a basic build.** It breaks the promise in
  `docs/standards/cpp.md` that one `Engine` serves many threads.

SPEC §3.4 now states this scope. Quest 30's test counts `operator new`: zero across table reads, and equal
counts across three identical `translate` calls, which catches a cache that fills or grows.

## Decision 6: Equivalence compares against `phone`

`tests/equivalence/` diffs the runtime back end against `phone` for the 248 eng sentences, and against the fixture build for
the xxa/xxb rows. It diffs all four fields of `Result`: `text`, `unl`, `trace` and `status`. ADR 0007 names three. `status`
joins them because a status change with equal text is still a divergence, and quest 30 already compares it.

The diff is fair because `phone` and the runtime back end read the same entries and the same rules. No selection sits between
them, so any difference is a back-end divergence. That is the only thing the suite exists to report.

| Pairing, over 248 sentences | Text or status differs | Graph or trace differs | Kind |
|---|---|---|---|
| Runtime on the full store against runtime on `basic`'s words | 5 | 7 | Measured |

Those differences come from selection and from no back-end fault. With `basic` as the subject, the suite would report them for
ever, and a real divergence would hide among them. Decision 2's table shows the mechanism: `a group of friends` differs because
`group` is dropped.

`basic` is not left untested. Quest 30 runs every eng-afr golden row on it and compares text and status with the runtime back end.
Selection can hurt a fixed row only there, and pins protect those rows.

The suite on `phone` runs where `phone` is built: on a branch with a path on decision 3's list. A plain pull request diffs the
fixture pair. The label `equivalence` therefore holds different counts on different branches, so the `data` job checks that the
`phone` case is registered, and fails if it is not. Each case also asserts the name its linked tables report, so a case that links
`basic` under another name still fails.

| Suite cost | Figure | Kind |
|---|---|---|
| 248 sentences, runtime back end | 7.9 s alone | Measured |
| The same sentences, generated back end | Below that, with no store read | Estimated |

**Rejected:**

- **`basic` against a runtime back end on the full store.** It reports the 5 differences above.
- **`basic` against a runtime back end on a filtered store.** The diff is fair, but it needs the compiler to write a third form of
  the store, for a suite that then checks fewer words than `phone` does.
- **An allow-list of expected differences.** Each data change would rewrite it, and a real divergence could hide in it.

## Consequences

- ADR 0003's line "committed generated output is how a tier build is reproducible without Python" now holds for the fixture and
  `basic` only. `phone` and `connected` need Python and the store.
- ADR 0007's "generated code and tables" narrows to tables. Its identical-trace demand holds, and gains `status`.
- Rule parsing moves out of `translate`, for both back ends. Today `analyse_tree` and `generate` parse on every call.
- A pull request's C++ legs gain the `basic` build: 13.3 s on GCC and 708 MB, one file at a time.
- `n` must rise with the partner count as the afr store grows. The compiler's failure says when.
- A dictionary change that adds an eng string puts nearly a full copy of eng's `basic` files in the pack, about 4 MB.
- Each open quest's acceptance criteria carry its part of this ADR, and `27-test-cases.md` names the quest for each row.

These files change with this ADR or after it:

| File | What changes | Who changes it |
|---|---|---|
| `docs/factory/SPEC.md` §3.4, §3.5, §5, §7 | The contracts above | This quest |
| `docs/glossary.md` | Fixture build, Partner headword, Capitalised headword, Fixed-set row | This quest |
| `docs/factory/PLAN.md:30,69-71,161` | "Generated code" becomes generated tables | This quest |
| `docs/standards/testing.md` | The label `data`, and the `tests/golden/<tier>/` rule | Quest 29 |
| `.claude/commands/gate.md:3,64-67` | Step 6, and "all tier builds" | Quest 29 |
| `tools/factory/hooks/gate_full.sh` step 6 | Step 6 | Quest 29 |
| `.gitignore` | `phone` and `connected` | Quest 29 |
| `engine/CLAUDE.md:9` | Reach tables through `generated_tables.hpp`, not the per-tier header | Quest 30 |
| `.github/workflows/gate.yml` | Step 6, the porcelain check, the `data` job | Quest 203 |
| ADR 0003, ADR 0007 | One-line pointers to this ADR | This quest |
