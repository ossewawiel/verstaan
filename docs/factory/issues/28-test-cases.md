# Issue 28 — test cases

**This file is the source of truth.** Where a test, a stub, the ADR or a fixture could drift from it, this file wins and the other is corrected. One exception, as in `27-test-cases.md`: for rows A01 to A17, `04-test-cases.md` wins on the words. Every `expected` in part 7 is copied from it.

ADR 0029, accepted by the owner on 2026-11-04, explains the design and records the rulings.

Expected values come from `04-test-cases.md`. For A09, A12 and A13, that file holds the owner's ruling of 2026-11-04. The owner saw a probe's text for those three before ruling. The authority for each is the ruling, with ADR 0025 for A09 and eng row A01 for A12 and A13.

A scratch probe outside the repository ran the drafted store through today's engine, with `Lang::eng` and `Lang::afr` standing in for the pair. It checked that all 17 rows reach those values, and that the `rule ids` column and the rule tables read right.

## Review

| Mark | Meaning |
|---|---|
| `confirmed (NN Axx)` | Transcribed from an owner-confirmed row of that table. That table wins on the words. |
| `n/a` | Invented words or no words. The author of the pair is the authority (`04-test-cases.md`). |

This quest writes no new English or Afrikaans text, so no row is `pending`. No Dutch row exists.

## What the tests call

Engine, stubs added by this pass:

```cpp
// engine/include/verstaan/lang.hpp
std::optional<Lang> lang_from_iso3(std::string_view code);
std::string iso3_of(Lang lang);
// engine/include/verstaan/rule_set.hpp
std::optional<Lang> RuleSet::from_lang() const;
std::optional<Lang> RuleSet::to_lang() const;
```

Golden runner, in `tests/golden/row_loader.hpp`. This pass adds none of these, and the test-writer stubs them. They stay out of `engine/`, because only the runner reads a `direction`.

```cpp
struct Direction { Lang from; Lang to; };
std::optional<Direction> parse_direction(std::string_view direction);
std::optional<std::filesystem::path> store_root_for(std::string_view iso3);
std::string golden_case_id(const Row& row);
std::vector<std::string> duplicate_ids(const std::vector<Row>& rows);  // case ids held more than once
```

Notation: `xxa` in `expected` means `lang_from_iso3("xxa")`. **none** means no value. `—` means the column does not apply. `<fixture>` is `tests/fixtures/languages`.

## Block L

### Part 1: direction parsing

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L01 | `parse_direction("xxa->xxb")` | from `xxa`, to `xxb` | — | — | n/a | — | The fixture spelling. |
| L02 | `parse_direction("xxb->xxa")` | from `xxb`, to `xxa` | — | — | n/a | — | Not a copy of L01 with one flag: the two codes swap. |
| L03 | `parse_direction("eng-afr")` | from `Lang::eng`, to `Lang::afr` | — | — | n/a | — | The eng spelling (`24-test-cases.md`). |
| L04 | `parse_direction("eng->afr")` | from `Lang::eng`, to `Lang::afr` | — | — | n/a | — | Either spelling takes either pair. |
| L05 | `parse_direction("xxa-xxb")` | from `xxa`, to `xxb` | — | — | n/a | — | The same, the other way round. |
| L06 | `parse_direction("")` | **none** | — | — | n/a | — | |
| L07 | `parse_direction("xxa")` | **none** | — | — | n/a | — | No target. |
| L08 | `parse_direction("xxa->")` | **none** | — | — | n/a | — | |
| L09 | `parse_direction("->xxb")` | **none** | — | — | n/a | — | |
| L10 | `parse_direction("xxa->xxb->xxa")` | **none** | — | — | n/a | — | Three codes. A split on the first separator must not accept it. |
| L11 | `parse_direction("xxa-xxb-xxa")` | **none** | — | — | n/a | — | L10 in the other spelling. |
| L12 | `parse_direction("XXA->XXB")` | **none** | — | — | n/a | — | A code is lower case (L28). |
| L13 | `parse_direction("xxb<-xxa")` | **none** | — | — | n/a | — | |
| L14 | `parse_direction("eng_afr")` | **none** | — | — | n/a | — | A case id is not a direction. |
| L15 | `parse_direction("xxa -> xxb")` | **none** | — | — | n/a | — | `load_yaml` trims the value, not its inside. |
| L16 | `parse_direction("en-af")` | **none** | — | — | n/a | — | iso1, which `meta.yaml` also holds, is not iso3. |
| L17 | `run_row` on an in-memory row: `direction: xxa to xxb`, id `mem_bad` | One failure naming `mem_bad` and the direction. Not skipped. | — | — | n/a | — | Today such a row registers as skipped, under the prefix its bad direction spells. |

### Part 2: iso3 to `Lang`

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L18 | `lang_from_iso3("eng")` | `Lang::eng` | — | — | n/a | — | |
| L19 | `lang_from_iso3("afr")` | `Lang::afr` | — | — | n/a | — | |
| L20 | `lang_from_iso3("nld")` | `Lang::nld` | — | — | n/a | — | Maps with no store. M6 adds the store. |
| L21 | `lang_from_iso3("xxa")`, then `iso3_of` | A value that is none of the three members, and `xxa` back | — | — | n/a | — | The proof that a language needs no member. |
| L22 | `lang_from_iso3("xxb")` | A value not equal to `xxa` | — | — | n/a | — | |
| L23 | `iso3_of(Lang::eng)` | `eng` | — | — | n/a | — | The member and the mapping agree. |
| L24 | `iso3_of(Lang::afr)` | `afr` | — | — | n/a | — | |
| L25 | `lang_from_iso3("zzz")`, then `iso3_of` | A value, and `zzz` back | — | — | n/a | — | Unknown to every store, and still a code. The store decides the rest: L44, L55. |
| L26 | `lang_from_iso3("")` | **none** | — | — | n/a | — | Unknown code, not a code at all. |
| L27 | `lang_from_iso3("en")` | **none** | — | — | n/a | — | iso1. |
| L28 | `lang_from_iso3("ENG")` | **none** | — | — | n/a | — | Generated file names are lower case (ADR 0028). |
| L29 | `lang_from_iso3("engl")` | **none** | — | — | n/a | — | |
| L30 | `lang_from_iso3("e1g")` | **none** | — | — | n/a | — | |
| L31 | `lang_from_iso3("\xC3\xA9a")` | **none** | — | — | n/a | — | `éa`: three bytes, two characters. A byte count alone must not accept it. |
| L32 | `iso3_of(Lang{})` | Empty string | — | — | n/a | — | A value with no code. |

### Part 3: the engine takes its pair from the store

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L33 | `RuleSet::load(<fixture>/xxa, <fixture>/xxb)` | `from_lang()` is `xxa`, `to_lang()` is `xxb` | — | — | n/a | — | |
| L34 | `RuleSet::load(data/languages/eng, data/languages/afr)` | `from_lang()` is `Lang::eng`, `to_lang()` is `Lang::afr` | — | — | n/a | — | The real `meta.yaml` files. |
| L35 | `RuleSet::load` on a copy of the xxa store in a folder named `renamed` | `from_lang()` is `xxa` | — | — | n/a | — | Proves the read uses `meta.yaml`, not the path. |
| L36 | `RuleSet::load` on a root with no `meta.yaml` | `from_lang()` is **none** | — | — | n/a | — | |
| L37 | `RuleSet::from_rules({}, {}, {}, {}, {}, {})` | `from_lang()` and `to_lang()` are **none** | — | — | n/a | — | |
| L38 | Engine on xxa and xxb; `kano zuma sona` | Empty text, `not_implemented` | eng-afr | neutral | n/a | — | The pair the engine did not load. The old literal check would let this one in. |
| L39 | Engine on xxa and xxb; `hundo kinda vidra` | Empty text, `not_implemented` | xxb->xxa | neutral | n/a | — | The reverse pair needs its own `RuleSet`. |
| L40 | Engine on eng and afr; `book` | Empty text, `not_implemented` | xxa->xxb | neutral | n/a | — | |
| L41 | Engine on eng and afr; `book` | Empty text, `not_implemented` | afr->eng | neutral | n/a | — | `UnsupportedDirectionIsNotImplemented` must stay green. |
| L42 | Engine on xxa and xxb; `kano zuma sona` | Empty text, `not_implemented` | xxa->xxb | formal | n/a | — | Register stays M5's, on a fixture pair too. |
| L43 | Engine on xxa and xxb; `kano zuma sona`, `Context::medical` | Empty text, `not_implemented` | xxa->xxb | neutral | n/a | — | |
| L44 | Engine on eng and afr; `book`, `from` is `lang_from_iso3("zzz")` | Empty text, `not_implemented` | zzz-afr | neutral | n/a | — | |
| L45 | Engine on a root with no `meta.yaml`; `kano` | Empty text, `not_implemented` | xxa->xxb | neutral | n/a | — | Today, with eng and afr options, a store-less run gives a mark and `partial`. Quest 210 turns it into a load failure. |
| L46 | Engine on eng and afr; `book` | `boek`, `ok` | eng-afr | neutral | confirmed (24 A01) | — | The one direction that works today still works. |
| L47 | Trace of A01 | Generation entries start `xxb-gen-`; no entry starts `afr-` or `-gen-` | xxa->xxb | neutral | n/a | xxb-gen-01 | ADR 0024's prefix comes from `to`, with no switch. |
| L48 | Trace of A03 | Holds `xxb-inf-M1` | xxa->xxb | neutral | n/a | xxb-inf-M1 | |
| L49 | Trace of A02 | Generation entries start `xxa-gen-` | xxb->xxa | neutral | n/a | xxa-gen-01 | |
| L50 | `RuleInterpreter::disambiguate_target`, target `xxb`, one in-memory rule with id `9` that fires | One entry, `xxb-dis-9` | — | — | n/a | — | `rule_interpreter.cpp:809`. No fixture D-rule exists, so the rule is in memory. |
| L51 | `Dictionary::load(<fixture>/xxa, xxa).lookup("kano")` | One entry, `lang` is `xxa` | — | — | n/a | — | |
| L52 | `DictionaryEntry{}.lang` | `Lang{}`, not `Lang::eng` | — | — | n/a | — | `dictionary.hpp:39`. |
| L53 | `grep -rnE 'Lang::(eng\|afr\|nld)\|switch \(lang' engine/src` | No match | — | — | n/a | — | A source check. Comments that mention eng or afr may stay. |

### Part 4: the CLI

Exit codes as SPEC §3.6. A bad flag is exit 1 and nothing on stdout.

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L54 | `verstaan_cli --from eng --to afr "book"` | Prints `boek`, exit 0 | eng-afr | neutral | confirmed (24 A01) | — | |
| L55 | `verstaan_cli --from zzz --to afr "book"` | stderr `verstaan: bad --from`, exit 1 | zzz-afr | neutral | n/a | — | A code with no store. Exit 1 today too, by another path. |
| L56 | `verstaan_cli --from eng --to zzz "book"` | stderr `verstaan: bad --to`, exit 1 | eng-zzz | neutral | n/a | — | |
| L57 | `verstaan_cli --from ENG --to afr "book"` | stderr `verstaan: bad --from`, exit 1 | — | neutral | n/a | — | Not a code. |
| L58 | `verstaan_cli --from xxa --to xxb "kano zuma sona"` | stderr `verstaan: bad --from`, exit 1 | xxa->xxb | neutral | n/a | — | The CLI reads `data/languages/` only. The invented pair never ships. |
| L59 | `verstaan_cli --from nld --to afr "book"` | stderr `verstaan: bad --from`, exit 1 | nld-afr | neutral | n/a | — | The exit stays 1, and the reason moves to stderr. Today this prints an empty line, through `not_implemented`. The row holds no Dutch text. |

### Part 5: the runner finds a store by direction

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L60 | `store_root_for("xxa")` | `<repo>/tests/fixtures/languages/xxa` | — | — | n/a | — | A folder there with `meta.yaml` wins. |
| L61 | `store_root_for("eng")` | `<repo>/data/languages/eng` | — | — | n/a | — | `<fixture>/eng` holds `tests/` only, with no `meta.yaml`. |
| L62 | `store_root_for("zzz")` | **none** | — | — | n/a | — | |
| L63 | `run_row` on an in-memory row: direction `zzz->xxb`, id `mem_nostore` | One failure naming `mem_nostore` and `zzz`. Not skipped. | zzz->xxb | neutral | n/a | — | |

### Part 6: ids stay prefixed and unique

The rule: a row in the default direction, spelled `eng-afr`, keeps its bare id. Every other direction prefixes its own spelling, with each non-alphanumeric byte as `_`, then the id in lower case.

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L64 | `golden_case_id`: id `A01` | `xxa__xxb_a01` | xxa->xxb | — | n/a | — | Today's `skipped()` form, so the names in issue 202 hold. |
| L65 | `golden_case_id`: id `A02` | `xxb__xxa_a02` | xxb->xxa | — | n/a | — | |
| L66 | `golden_case_id`: id `A01` | `A01` | eng-afr | — | n/a | — | The eng spelling stays bare, so `ctest -R A09` stays one row. |
| L67 | `golden_case_id`: id `A09` | `xxa__xxb_a09`, which does not contain `A09` | xxa->xxb | — | n/a | — | Why the id is lower-cased after the prefix. |
| L68 | `duplicate_ids`: `A01` in eng-afr, `A01` in xxa->xxb | Empty | — | — | n/a | — | The collision the issue names. Removing the prefix turns this row red. |
| L69 | `duplicate_ids`: `A01` in xxa->xxb, twice | `[xxa__xxb_a01]` | — | — | n/a | — | Proves the check can fail. |
| L70 | `duplicate_ids`: `A01` in eng-afr, twice | `[A01]` | — | — | n/a | — | |
| L71 | `duplicate_ids(load_golden_rows())` | Empty | — | — | n/a | — | Every real row, across every language. |
| L72 | `load_golden_rows()`, counted by direction | 9 in `xxa->xxb`, 8 in `xxb->xxa` | — | — | n/a | — | The eng-afr count is left open, because quest 29 adds text rows. |
| L73 | `ctest --preset linux-gcc -L golden` | No `skipped_row` case exists, and no xxa/xxb case reports Skipped | — | — | n/a | — | Today 17 do. A `pending` eng mismatch may still skip: that path is issue 202's. |
| L74 | `ctest --preset linux-gcc -L held-out` | The same case count before and after | — | — | n/a | — | `load_held_out_rows` calls `runnable`, which this quest changes. No row of that slice is named here. |

### Part 7: the 17 rows

The golden runner runs these from the YAML files, under the case ids of part 6. Expected text and status are copied from block A of `04-test-cases.md`. Under the drafted store, 17 of 17 match. The counts are fourteen `ok`, three `partial` and no `no_parse`.

Text alone does not prove the rewrite on every row. Under the store as committed, no rule fires, and A09, A10, A12 and A13 still reach their text. The test-writer therefore also turns the `rule ids` column and the rule tables below into trace assertions. A test that reads a graph compares attributes as a set: A16 gives `@pl` then `@def`, and A17 gives `@def` then `@pl`.

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| A01 | `kano zuma sona` | `hundo kinda vidra`, `ok` | xxa->xxb | neutral | n/a | xxa-ana-01, xxb-gen-01, xxb-gen-08, xxb-gen-09, xxb-gen-11 | Must not fire: xxa-ana-02 to 05, xxb-gen-02 to 07, xxb-gen-10, xxb-gen-12, xxb-inf-M1. |
| A02 | `hundo kinda vidra` | `kano zuma sona`, `ok` | xxb->xxa | neutral | n/a | xxb-ana-01, xxa-gen-01, xxa-gen-07, xxa-gen-08, xxa-gen-09 | Must not fire: xxb-ana-02 to 04, xxa-gen-02 to 06, xxa-gen-10, xxa-inf-M1, xxa-inf-M2. |
| A03 | `ta kano zuma sona` | `hundon kinda vidra`, `ok` | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-02, xxb-gen-01, xxb-gen-02, xxb-gen-08, xxb-gen-09, xxb-gen-11, xxb-inf-M1 | A separate word becomes a suffix. |
| A04 | `hundon kinda vidra` | `ta kano zuma sona`, `ok` | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-04, xxa-gen-01, xxa-gen-02, xxa-gen-06, xxa-gen-07, xxa-gen-08, xxa-gen-09, xxa-gen-10 | A suffix becomes a separate word. |
| A05 | `kanoki zuma sona` | `mo hundo kinda vidra`, `ok` | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-04, xxb-gen-01, xxb-gen-04, xxb-gen-06, xxb-gen-08, xxb-gen-09, xxb-gen-11, xxb-gen-12 | |
| A06 | `mo hundo kinda vidra` | `kanoki zuma sona`, `ok` | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxa-gen-01, xxa-gen-04, xxa-gen-07, xxa-gen-08, xxa-gen-09, xxa-inf-M1 | |
| A07 | `sona rintadu nolu bero` | `kinda libru pikko da lektu`, `ok` | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-03, xxa-ana-05, xxb-gen-01, xxb-gen-03, xxb-gen-05, xxb-gen-07, xxb-gen-08, xxb-gen-09, xxb-gen-10, xxb-gen-12 | Five words. The top span holds four items, the most the flatten rules take (ADR 0021). |
| A08 | `kinda libru pikko da lektu` | `sona rintadu nolu bero`, `ok` | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxb-ana-03, xxa-gen-01, xxa-gen-03, xxa-gen-05, xxa-gen-07, xxa-gen-08, xxa-gen-09, xxa-gen-10, xxa-inf-M2 | |
| A09 | `sona zuma glimu` | `kinda vidra ⟦glimu⟧`, `partial` | xxa->xxb | neutral | n/a | xxa-ana-01, xxb-gen-01, xxb-gen-09, xxb-gen-12 | Owner ruling 2026-11-04 (ADR 0029). ADR 0025 appends the mark, and `glimu` is no graph node (ADR 0019). Must not fire: xxa-ana-02 to 05, xxb-gen-02 to 08, xxb-gen-10, xxb-gen-11, xxb-inf-M1. |
| A10 | `kinda glimu vidra` | `sona zuma ⟦glimu⟧`, `partial` | xxb->xxa | neutral | n/a | xxb-ana-01, xxa-gen-01, xxa-gen-08, xxa-gen-10 | The mark is appended, as in A09. The graph holds `agt` only. |
| A11 | `sona zuma veri` | `kinda ⟦veri⟧ vidra`, `partial` | xxa->xxb | neutral | n/a | xxa-ana-01, xxb-gen-01, xxb-gen-08, xxb-gen-09, xxb-gen-11 | `veri`'s UW has no xxb entry, so ADR 0025 makes a marked node that a rule can place. Compare A09. |
| A12 | `kano` | `hundo`, `ok` | xxa->xxb | neutral | n/a | xxb-gen-09 | Owner ruling 2026-11-04 (ADR 0029). One noun translates, as eng A01 does. Must not fire: xxa-ana-01 to 05, xxb-gen-01 to 08, xxb-gen-10 to 12, xxb-inf-M1. |
| A13 | `hundo` | `kano`, `ok` | xxb->xxa | neutral | n/a | xxa-gen-08 | Owner ruling 2026-11-04 (ADR 0029). The same as A12. Must not fire: xxb-ana-01 to 04, xxa-gen-01 to 07, xxa-gen-09, xxa-gen-10, xxa-inf-M1, xxa-inf-M2. |
| A14 | `milaki zuma ta kano` | `mo katsu hundon vidra`, `ok` | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-02, xxa-ana-04, xxb-gen-01, xxb-gen-02, xxb-gen-04, xxb-gen-06, xxb-gen-08, xxb-gen-09, xxb-gen-11, xxb-gen-12, xxb-inf-M1 | Fixture row, not eng's A14. |
| A15 | `mo katsu hundon vidra` | `milaki zuma ta kano`, `ok` | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxb-ana-04, xxa-gen-01, xxa-gen-02, xxa-gen-04, xxa-gen-06, xxa-gen-07, xxa-gen-08, xxa-gen-09, xxa-gen-10, xxa-inf-M1 | |
| A16 | `ta sonaki pelo beroki` | `mo kindan mo libru manga`, `ok` | xxa->xxb | neutral | n/a | xxa-ana-01, xxa-ana-02, xxa-ana-04, xxb-gen-01, xxb-gen-02, xxb-gen-04, xxb-gen-06, xxb-gen-08, xxb-gen-09, xxb-gen-11, xxb-gen-12, xxb-inf-M1 | `@def` and `@pl` on one node. |
| A17 | `mo kindan mo libru manga` | `ta sonaki pelo beroki`, `ok` | xxb->xxa | neutral | n/a | xxb-ana-01, xxb-ana-02, xxb-ana-04, xxa-gen-01, xxa-gen-02, xxa-gen-04, xxa-gen-06, xxa-gen-07, xxa-gen-08, xxa-gen-09, xxa-gen-10, xxa-inf-M1 | |

No test row proves `no_parse` on the pair. Empty and whitespace input are proved on the eng and afr engine only (`engine_status_test.cpp:129-140`). An unreadable forest is proved with no store (`read_graph_test.cpp:161`, `tree_pass_test.cpp:698-719`).

### Part 8: unit rows on the pair

xxa-gen-08 and xxb-gen-09 fire on any word with a paradigm, so every row above fires them. L75 and L76 are their must-not-fire rows. L77 and L78 prove `no_parse` on the pair. These rows are unit tests, not YAML rows, so the count of 17 holds.

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L75 | `glimu` | `⟦glimu⟧`, `partial` | xxa->xxb | neutral | n/a | — | No graph node, so no rule fires, and the trace is empty. ADR 0025's token mark. |
| L76 | `glimu` | `⟦glimu⟧`, `partial` | xxb->xxa | neutral | n/a | — | The same on the other side. |
| L77 | *(empty string)* | Empty text, `no_parse` | xxa->xxb | neutral | n/a | — | No tokens. Rulings on A12 and A13 left the pair with no `no_parse` row in YAML, so this row proves the path on the pair. |
| L78 | `"   \t  "` | Empty text, `no_parse` | xxb->xxa | neutral | n/a | — | Whitespace holds no tokens. The other direction, the same path. |

### Part 9: the verifier's findings (F01 to F10)

Owner ruling 2026-11-04 (F01): the CLI allows eng to afr only. Rows marked **by hand** have no automated test, because the CLI reads the checkout's own stores. They are run once with a CLI built against a scratch root.

| id | input | expected | direction | register | review | rule ids | note |
|---|---|---|---|---|---|---|---|
| L79 | `verstaan_cli --from afr --to eng "book"` | stderr `verstaan: only eng to afr is supported, not afr to eng`, exit 1, nothing on stdout | afr->eng | neutral | n/a | — | Both flags parse, so the refusal comes after the flag checks. |
| L80 | `verstaan_cli --from eng --to eng "book"` | stderr `verstaan: only eng to afr is supported, not eng to eng`, exit 1, nothing on stdout | eng->eng | neutral | n/a | — | |
| L81 | `verstaan_cli --from afr --to afr "book"` | stderr `verstaan: only eng to afr is supported, not afr to afr`, exit 1, nothing on stdout | afr->afr | neutral | n/a | — | |
| L82 | `RuleSet::load` on a store whose `meta.yaml` holds `iso3: xxa  # the code` | `from_lang()` is `xxa` | — | — | n/a | — | A trailing comment is not part of the value. |
| L83 | `meta.yaml` holds `iso3: 'xxa'` | `from_lang()` is `xxa` | — | — | n/a | — | Single quotes. |
| L84 | `meta.yaml` opens with a UTF-8 BOM, then `iso3: xxa` on its first line | `from_lang()` is `xxa` | — | — | n/a | — | |
| L85 | `meta.yaml` holds `iso3:xxa` | `from_lang()` is **none** | — | — | n/a | — | Not a mapping: YAML needs a space after the colon. |
| L86 | `meta.yaml` holds `notes: \|`, an indented line `  iso3: yyy`, then `iso3: xxa` | `from_lang()` is `xxa` | — | — | n/a | — | Top-level keys only. |
| L87 | `meta.yaml` holds the indented `  iso3: yyy` inside a block scalar and no top-level `iso3` | `from_lang()` is **none** | — | — | n/a | — | |
| L87b | `meta.yaml` holds `iso3: "xxa"` with CRLF line ends | `from_lang()` is `xxa` | — | — | n/a | — | Regression row: already held before F09. L86 and L87 are the same. |
| L88 | **By hand.** CLI whose `data/languages/eng/meta.yaml` holds no `iso3` | stderr names the store and says it holds no readable `iso3`, exit 1, nothing on stdout | eng-afr | neutral | n/a | — | Today: an empty line, `not_implemented`, exit 1. |
| L89 | **By hand.** CLI with no flags, and no `data/languages/eng/meta.yaml` | stderr `verstaan: no store for eng`, exit 1, nothing on stdout | eng-afr | neutral | n/a | — | Today: `RuleSet::load("", "")` looks for `/meta.yaml`. |
| L90 | `ctest --preset linux-gcc -N -L held-out`, cases named with `golden_case_id` | Case count 4, as before | — | — | n/a | — | Count only. |
| L91 | Validator: xxa analysis lhs `(N,PLZ,^@pl)` | Error naming the tag `PLZ` | — | — | n/a | — | A bare tag is checked against the tagset. |
| L92 | xxb analysis lhs `(Q,%s)({N\|^LEX},%o)(V,%v)` | Error naming `Q` | — | — | n/a | — | |
| L93 | xxa analysis lhs `(D,attt,%d)` | Error naming `attt` | — | — | n/a | — | |
| L94 | xxa inflection rhs `PLZ:=0>"ki";` | Error naming `PLZ` | — | — | n/a | — | |
| L95 | xxa generation rhs `-NUMX,+NUM=PLR` | Error naming `NUMX` | — | — | n/a | — | |
| L96 | A rule id with another language's prefix, `xxb-<kind>-04`, in an xxa grammar file | Error, one per grammar file | — | — | n/a | — | Every grammar file, not generation only. |
| L97 | A fixture rule with a non-empty `conditions` | Error: conditions must be empty | — | — | n/a | — | The engine skips `conditions`, so a value there checks nothing. |
| L98 | xxb analysis lhs `({N\|V},%n)` becomes `({N\|Q},%n)` | Error naming `Q` | — | — | n/a | — | A form the store writes. |

## Drafted fixture store

Owner ruling 2026-11-04 (ADR 0029): this quest rewrites the store. The implementer applies this draft. The test-writer changes the expected values of A09, A12 and A13 in the row YAML.

Every rule is `source: original`, and the store needs a comment on each. Generation and inflection ids are bare, as in the real stores, because the engine adds `<iso3>-gen-` and `<iso3>-inf-` to the trace. Analysis ids are stored qualified (`xxa-ana-01`), because the engine writes an analysis id to the trace as it stands. Either way the qualified name is the one SPEC §3.3 gives, and the validator resolves it. The order below is file order. The engine runs the first match in file order, so order matters and ids need not ascend.

### xxa analysis

| rule | lhs | rhs | comment | source | fires in | must not fire in |
|---|---|---|---|---|---|---|
| xxa-ana-04 | `(N,PLR,^@pl)` | `(+att=@pl)` | Marks a plural noun form with `@pl`. | original | A05 | A01 |
| xxa-ana-05 | `(V,PST,^@past)` | `(+att=@past)` | Marks a past verb form with `@past`. | original | A07 | A01 |
| xxa-ana-02 | `(D,att,%d)(N,%n)` | `(%n,+att=%d)` | Moves a function word's attribute onto the noun after it and drops the word. | original | A03 | A01 |
| xxa-ana-03 | `(J,%j)(N,%n)` | `(%n,mod(%n;%j))` | Hangs an adjective on the noun after it. | original | A07 | A01 |
| xxa-ana-01 | `(N,%s)(V,%v)({N\|^LEX,^STAIL},%o)` | `(%v,agt(%v;%s),obj(%v;%o))` | Takes the noun before the verb as agent and the word after it as object. | original | A01 | A12 |

### xxb analysis

| rule | lhs | rhs | comment | source | fires in | must not fire in |
|---|---|---|---|---|---|---|
| xxb-ana-04 | `(N,DEF,^@def)` | `(+att=@def)` | Marks a definite noun form with `@def`. | original | A04 | A02 |
| xxb-ana-02 | `(D,att,%d)({N\|V},%n)` | `(%n,+att=%d)` | Moves a particle's attribute onto the word after it and drops the particle. | original | A06 | A02 |
| xxb-ana-03 | `(N,%n)(J,%j)` | `(%n,mod(%n;%j))` | Hangs an adjective on the noun before it. | original | A08 | A02 |
| xxb-ana-01 | `(N,%s)({N\|^LEX},%o)(V,%v)` | `(%v,agt(%v;%s),obj(%v;%o))` | Takes the first word before the verb as agent and the second as object. | original | A02 | A13 |

### xxa generation

| rule | lhs | rhs | comment | source | fires in | must not fire in |
|---|---|---|---|---|---|---|
| xxa-gen-02 | `(%x,N,@def)` | `(NS(%x,-@def;%y,[ta],+LEX=D),+LEX=N)` | Hangs the article on a definite noun. | original | A04 | A02 |
| xxa-gen-04 | `(%x,N,@pl)` | `(%x,-@pl,-NUM,+NUM=PLR)` | Sets a plural noun for its suffix. | original | A06 | A02 |
| xxa-gen-05 | `(%x,V,@past)` | `(%x,-@past,-TNS,+TNS=PST)` | Sets a past verb for its suffix. | original | A08 | A02 |
| xxa-gen-06 | `NS(%x;%y)` | `(%y)(%x)` | Writes the article in front of its noun. | original | A04 | A02 |
| xxa-gen-03 | `mod(%x;%y)` | `(%y)(%x)` | Writes an adjective in front of its noun. | original | A08 | A02 |
| xxa-gen-01 | `agt(%x;%y)` | `(%y)(%x)` | Writes the agent in front of the verb. | original | A02 | A13 |
| xxa-gen-07 | `obj(%x;%y)` | `(%x)(%y)` | Writes the object after the verb. | original | A02 | A10 |
| xxa-gen-08 | `(%x,^inflected,FLX)` | `(%x,!FLX,+inflected)` | Runs a word's paradigm once. | original | A02 | L76 |
| xxa-gen-09 | `((%x)(%y)(%z))` | `(%x)(%y)(%z)` | Flattens a three-word span into the list. | original | A02 | A10 |
| xxa-gen-10 | `((%x)(%y))` | `(%x)(%y)` | Flattens a two-word span into the list. | original | A04 | A02 |

### xxb generation

| rule | lhs | rhs | comment | source | fires in | must not fire in |
|---|---|---|---|---|---|---|
| xxb-gen-04 | `(%x,N,@pl)` | `(NS(%x,-@pl;%y,[mo],+LEX=D),+LEX=N)` | Hangs the plural particle on a noun. | original | A05 | A01 |
| xxb-gen-05 | `(%x,V,@past)` | `(VS(%x,-@past;%y,[da],+LEX=D),+LEX=V)` | Hangs the past particle on a verb. | original | A07 | A01 |
| xxb-gen-02 | `(%x,N,@def)` | `(%x,-@def,+DEF)` | Sets a definite noun for its suffix. | original | A03 | A01 |
| xxb-gen-06 | `NS(%x;%y)` | `(%y)(%x)` | Writes the plural particle in front of its noun. | original | A05 | A01 |
| xxb-gen-07 | `VS(%x;%y)` | `(%y)(%x)` | Writes the past particle in front of its verb. | original | A07 | A01 |
| xxb-gen-03 | `mod(%x;%y)` | `(%x)(%y)` | Writes an adjective after its noun. | original | A07 | A01 |
| xxb-gen-08 | `obj(%x;%y)` | `(%y)(%x)` | Writes the object in front of the verb. | original | A01 | A09 |
| xxb-gen-01 | `agt(%x;%y)` | `(%y)(%x)` | Writes the agent in front of the object and the verb. | original | A01 | A12 |
| xxb-gen-09 | `(%x,^inflected,FLX)` | `(%x,!FLX,+inflected)` | Runs a word's paradigm once. | original | A01 | L75 |
| xxb-gen-10 | `((%x)(%y)(%z)(%w))` | `(%x)(%y)(%z)(%w)` | Flattens a four-word span into the list. | original | A07 | A01 |
| xxb-gen-11 | `((%x)(%y)(%z))` | `(%x)(%y)(%z)` | Flattens a three-word span into the list. | original | A01 | A07 |
| xxb-gen-12 | `((%x)(%y))` | `(%x)(%y)` | Flattens a two-word span into the list. | original | A05 | A01 |

Rule 227, 228, 229 and 230 of `data/languages/afr/grammar/generation.yaml` show the shape of the last four rules. The fixture writes them afresh, so their `source` stays `original`.

### Inflection

The id is the `PAR` value, as in the real stores (`M2`, `M3`).

| rule | rhs | comment | source | fires in | must not fire in |
|---|---|---|---|---|---|
| xxa-inf-M1 | `PLR:=0>"ki";` | Adds `ki` to a plural noun. | original | A06 | A02 |
| xxa-inf-M2 | `PST:=0>"du";` | Adds `du` to a past verb. | original | A08 | A02 |
| xxb-inf-M1 | `DEF:=0>"n";` | Adds `n` to a definite noun. | original | A03 | A01 |

### Dictionary and tagset

| Change | Files | Why |
|---|---|---|
| `uw: null` becomes `uw: ""` | `ta`, `da`, `mo` | The fixed-line reader takes `null` as text, so each word enters the graph as a node named `null`. |
| `ATT:` becomes `att:` | `ta`, `da`, `mo` | Only `att` moves onto a node's attributes (`tree_pass.cpp:562`). |
| `PAR` values become `M0`, `M1`, `M2` | Every entry. xxa verbs take `M2`, and xxb verbs keep `M0`. | A word takes `FLX` only when a paradigm has that id (`generation.cpp:1019`). |
| Add `kanoki`, `milaki`, `sonaki`, `beroki` (`BF` the lemma, `NUM: PLR`, `PAR: M1`) | xxa | The reader looks up exact headwords, as `books` in the eng store. |
| Add `rintadu` (`BF: rinta`, `TNS: PST`, `PAR: M2`) | xxa | The same. |
| Add `hundon`, `kindan` (`BF` the lemma, `DEF: Y`, `PAR: M1`) | xxb | The same. |
| Add `BF`, `att`, `DEF`; rename `ATT`; set `PAR` values | both `tagset.yaml` | The validator resolves every feature here. |
| Update `counts` | both `meta.yaml` | xxa holds 15 entries, 5 analysis, 10 generation. xxb holds 12, 4 analysis, 12 generation. `test_fixture_languages.py` compares them. |

### What the draft breaks elsewhere

The implementer changes these in the same commit.

- `tools/validate/tests/test_fixture_languages.py`: `check_grammar_rules` requires an id prefixed with the language, and it reads the old `[LEX:N]` pattern. Its fixture-breaking tests name `xxa-inf-01` and `xxb-gen-04`.
- `tools/validate/tests/test_fixture_languages.py:687-693`: `test_row_check_fails_when_a_status_is_changed` swaps A13's `no_parse` for `ok`. A13 is now `ok`, so the swap does nothing and the test fails. It needs another row or another status.
- `tests/fixtures/languages/xxa/corpus/basic.yaml:37-41` and `.../xxb/corpus/basic.yaml:37-41`: both write `obj(see(icl>perceive), "glimu")`, and the xxa note says `glimu` becomes a literal UW. Both disagree with the graph that `04-test-cases.md` now holds.
