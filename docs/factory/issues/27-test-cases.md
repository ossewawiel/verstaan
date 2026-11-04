# Issue 27 — test cases

**This file is the source of truth.** Where a test written from it, `tiers.toml`, a fixture or a quest
file could drift from it, this file wins and the other is corrected to match. ADR 0028 explains each
rule. The `quest` column names the quest that turns each row into a test.

No `expected` value here came from running the engine or the compiler. `Engine::generated` is a stub
and `tools/compiler` is a skeleton. Each slice's `expected` is worked by hand from ADR 0028. Each
sentence's `expected` is transcribed from a table the owner confirmed, or follows from the mark rule
in SPEC §3.4 and the owner's rulings. Rows that say "equal to" name a comparison and hold no literal
text.

## Review

| Mark | Meaning |
|---|---|
| `pending` | Holds real eng or afr words, and the owner has not ticked it. |
| `confirmed (NN Axx)` | Transcribed from an owner-confirmed row of that table. That table wins on the words. |
| `n/a` | Invented words or no words. The author of the slice is the authority. |

No Dutch row exists.

## Notation

A **slice** lists entries as `headword uw frequency priority`, separated by `;`, with `priority` left
out when 0. A `-` for `uw` is an empty UW, a closed-class record. `eng:` and `afr:` open each language.
Store order is the order written. Unless a row names a shard, one file holds the slice. `n=` is the
tier's `n`. `rows:` lists table rows in table order. `fixed:` is a fixed-set row, a `tier: basic` row
under the store's `tests/`.

`direction` is `compile` for a compiler row, `build` for a CMake or linker row, `branch` for a row about
what a branch compiles, `unit` for a row that tests the suite's own diff, a language for a lookup row, and a
language direction for a translation.

`lookup(lang, word)` and `lookup_uw(lang, uw)` read one language's arrays, through the table reader
quest 30 writes.

**The label `data`** marks a case that needs a real store compiled or `phone` built. It runs in the
`data` job and in `/gate` on a branch with a path on `[real_stores].compile_when_changed`. Quest 29 adds
the label, and its line in `docs/standards/testing.md`. Rows on committed `basic` carry no such label,
and they run on every branch.

CMake rows use a plain `cmake -S . -B build/t`, with the leg's usual toolchain flags. The `linux-gcc`
preset lives only in the gitignored `CMakeUserPresets.json`, so a clean checkout does not have it.

## Selection rules

Each is `source: original`. No archive rule covers a tier, so none could be adapted. S8 is the owner's
ruling R1 of 2026-11-04.

| Rule | Text | Fires | Must not fire |
|---|---|---|---|
| S1 | A kept headword keeps every entry, and a dropped one keeps none. | T04, T05 | T01 |
| S2 | Among headwords no pin holds, partner headwords rank first. An empty UW makes no partner. | T09 | T10, T107 |
| S3 | Next, the headword's highest `frequency` ranks first. | T02, T03 | T01 |
| S4 | Next, the lowest UTF-8 bytes rank first. | T01, T06, T07 | T02 |
| S5 | Every headword with a closed-class record is pinned, and takes no ranked place. | T13, T14, T15, T24 | T01 |
| S6 | Every headword a fixed-set row needs is pinned. | T17, T19, T20 | T18, T21, T22 |
| S7 | `n` below a language's count of partner headwords no pin holds fails, and nothing is written. | T12 | T09, T107 |
| S8 | Every capitalised headword is pinned: first character Unicode `Lu`, no space. | T96, T98, T100, T101 | T97, T99 |

No grammar rule is drafted here. No store file changes.

## Block T

### Selection (rules S1 to S8)

| id | input | expected | direction | register | review | quest | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| T01 | `eng: b u1 3; a u2 3; c u3 3` n=2 | rows: `b`, `a` | compile | neutral | n/a | 29 | S4 | A three-way tie. Bytes pick `a` and `b`, and the table keeps store order. Must-not row for S1, S3, S5. |
| T02 | `eng: a u1 1; z u2 9` n=1 | rows: `z` | compile | neutral | n/a | 29 | S3 | Frequency beats bytes. Must-not row for S4. |
| T03 | `eng: m u1 1; m u2 9; k u3 5` n=1 | rows: `m u1`, `m u2` | compile | neutral | n/a | 29 | S3, S1 | A headword ranks by its highest entry, 9, not by its first entry, 1. |
| T04 | `eng: cut u1 9; cut u2 1; cut u3 1; dog u4 5` n=1 | rows: `cut u1`, `cut u2`, `cut u3` | compile | neutral | n/a | 29 | S1 | Three entries count as one against `n`. `dog` loses to `cut`. |
| T05 | `eng: bank u1 1; bank u2 9; top u3 5` n=1 | rows: `bank u1`, `bank u2` | compile | neutral | n/a | 29 | S1 | The low-frequency sense stands first and stays first. An entry-level cut would remove `bank u1` and change what `bank` means. |
| T06 | `eng: ab u1 2; aB u2 2` n=1 | rows: `aB` | compile | neutral | n/a | 29 | S4 | `B` is 0x42 and `b` is 0x62, so case is not folded. Neither headword is capitalised, because the first character decides that. |
| T07 | `eng: éa u1 2; zoo u2 2` n=1 | rows: `zoo` | compile | neutral | n/a | 29 | S4 | `z` is 0x7A and `é` starts 0xC3. A byte compare, with no locale. `é` is lower case, so no pin applies. |
| T08 | T01's entries, written `c`, `a`, `b` | rows: `a`, `b` | compile | neutral | n/a | 29 | S4 | Reordering the store leaves the same set kept, and the rows follow the new store order. |
| T09 | `eng: rare u1 1; common u2 9` `afr: seldsaam u1 2` n=1 | eng rows: `rare`. afr rows: `seldsaam` | compile | neutral | n/a | 29 | S2 | `rare` shares a UW with afr, so it outranks `common`. `n` equals the partner count, so S7 does not fire. |
| T10 | `eng: rare u1 1; common u2 9` `afr: ander u3 2` n=1 | eng rows: `common`. afr rows: `ander` | compile | neutral | n/a | 29 | S3 | No shared UW, so frequency decides. Must-not row for S2. |
| T11 | `eng: a u1 1; b u2 1` n=5 | rows: `a`, `b` | compile | neutral | n/a | 29 | — | `n` above the headword count keeps the whole language, with no error. |
| T12 | `eng: a u1 1; b u2 1` `afr: x u1 1; y u2 1` n=1 | Fails. The message names `eng` or `afr`, 2 partner headwords and `n` = 1. `engine/generated/basic/` is unchanged | compile | neutral | n/a | 29 | S7 | A cut here could remove the word lexical choice wants, with no report. |
| T13 | `eng: top u1 9; the - 0` n=1 | rows: `top`, `the` | compile | neutral | n/a | 29 | S5 | The kept count passes `n` by the pins. |
| T14 | `eng: the - 255; top u1 9` n=1 | rows: `the`, `top` | compile | neutral | n/a | 29 | S5, S3 | `the` has the highest frequency and still takes no ranked place. `top` keeps the one place. |
| T15 | `afr: boek 106410904 5; die - 0; 'n - 0` n=1 | rows: `boek`, `die`, `'n` | compile | neutral | pending | 29 | S5 | The real records. `die` and `'n` sit at frequency 0, the lowest rank there is. |
| T16 | `afr: die - 0; die u7 1; boek u8 5` n=1 | rows: `die -`, `die u7`, `boek` | compile | neutral | n/a | 29 | S5, S1 | A pin holds the whole headword, including its open-class sense. |
| T17 | `eng: zyx u1 1; top u2 9` fixed: `zyx` n=1 | rows: `zyx`, `top` | compile | neutral | n/a | 29 | S6 | Rank gives `top`, the pin adds `zyx`. Rows follow store order. |
| T18 | T17's entries, with `zyx` on a `tier: phone` row | rows: `top` | compile | neutral | n/a | 29 | S6 | Only `tier: basic` pins. Must-not row for S6. |
| T19 | `eng: book u1 1; top u2 9` fixed: `Book` n=1 | rows: `book`, `top` | compile | neutral | n/a | 29 | S6 | The pin holds `Book` and `book`, the engine's sentence-initial retry. Only `book` has an entry. |
| T20 | `eng: zyx u1 1; top u2 9` fixed: `zyx`, with `deferred: 207` on the row | rows: `zyx`, `top` | compile | neutral | n/a | 29 | S6 | A deferred row still pins, because its issue will make it pass on this tier. |
| T21 | `eng: top u1 9` fixed: `Qwerty` n=1 | rows: `top`, no error | compile | neutral | n/a | 29 | S6 | A token with no entry pins nothing. Must-not row for an error. |
| T22 | T17's entries, with `zyx` on a row outside the store's `tests/` folder | rows: `top` | compile | neutral | n/a | 29 | S6 | The compiler reads no other test file. |
| T23 | `eng: a'b u1 1; top u2 9` fixed: `a'b, top.` n=1 | rows: `a'b`, `top` | compile | neutral | n/a | 29 | S6 | Tokens are `a'b`, `,`, `top`, `.`, by the rules of `19-test-cases.md`. A second tokeniser in Python can drift, so quest 29 also tests its tokens against that table. |
| T96 | `eng: Zed u1 1; top u2 9` n=1 | rows: `Zed`, `top` | compile | neutral | n/a | 29 | S8 | The owner's capital pin. |
| T97 | `eng: New York u1 1; top u2 9` n=1 | rows: `top` | compile | neutral | n/a | 29 | S8 | A space means no token can reach it. Must-not row for S8. |
| T98 | `eng: Áine u1 1; top u2 9` n=1 | rows: `Áine`, `top` | compile | neutral | n/a | 29 | S8 | Non-ASCII `Lu` is capitalised. Today's engine test is `A` to `Z`, and quest 207 removes that limit. |
| T99 | `eng: iPhone u1 1; top u2 9` n=1 | rows: `top` | compile | neutral | n/a | 29 | S8 | The first character decides. Must-not row for S8. |
| T100 | `eng: Anglo-Saxon u1 1; John's u2 1; top u3 9` n=1 | rows: `Anglo-Saxon`, `John's`, `top` | compile | neutral | n/a | 29 | S8 | A token can hold a hyphen or an inner apostrophe, so both are reachable. |
| T101 | `eng: Zed u1 9; the - 255; a u2 5; b u3 3` n=1 | rows: `Zed`, `the`, `a` | compile | neutral | n/a | 29 | S8, S5, S3 | Pins take no ranked place, so `a` holds the one place. |
| T107 | `eng: the - 0; top u1 9` `afr: die - 0; ander u2 2` n=1 | eng rows: `the`, `top`. afr rows: `die`, `ander` | compile | neutral | n/a | 29 | S2, S5 | An empty UW on both sides makes no partner. A literal reading counts `the` and `die` as partners. Must-not row for S7. |
| T24 | Real stores, `n` = 30000 | Every closed-class record of eng (1,111 today) and afr (230 today) is a table row | compile | neutral | pending | 29 | S5 | Label `data`. The count is read from the store at test time. The figures here date this row. |
| T25 | Real stores, `n` = 30000 | Every entry of `book` (26 today), `library` (12 today) and `German` is a table row | compile | neutral | pending | 29 | S1, S2, S8 | Label `data`. `library` has frequency 4 and a partner, `biblioteek`. Frequency alone drops it. |
| T26 | Real stores, `n` = 30000 | `slumbrous` has no table row | compile | neutral | pending | 29 | S2 | Label `data`. A rare headword with no partner. It proves the tier cuts. |

### Table shape

| id | input | expected | direction | register | review | quest | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| T27 | `eng: daz u1 1; dab u2 1` | rows: `daz`, `dab` | compile | neutral | n/a | 29 | — | Store order, not alphabetical sort. ADR 0023 reads store order. |
| T28 | `afr: boks 102883344 5 2` in `b.yaml`; `doos 102883344 5 1` in `d.yaml` | `lookup_uw(afr, "102883344")` gives `boks`, then `doos` | afr | neutral | pending | 30 | — | Shard `a` to `z`, across shards. ADR 0023's lexical choice reads this. |
| T29 | `afr: kar 102958343 5 1` in `k.yaml`; `motor 102958343 5 2` in `m.yaml` | `lookup_uw(afr, "102958343")` gives `kar`, then `motor`, with priorities 1 and 2 | afr | neutral | pending | 30 | — | The table keeps store order and both priorities. The owner's `motor` ruling comes from lexical choice reading them. |
| T30 | `eng: book u1 5; book u2 1; book u3 9` | `lookup(eng, "book")` gives u1, u2, u3 | eng | neutral | n/a | 30 | — | Every homograph, in store order, not frequency order. The engine takes the first (`engine.cpp`). |
| T31 | `eng: john u1 9` | `lookup(eng, "John")` is empty, `lookup(eng, "john")` gives one row | eng | neutral | pending | 30 | — | Case-sensitive, as `verstaan/dictionary.hpp` says. Row A13 depends on it. |
| T32 | `afr: die - 0` | `lookup_uw(afr, "")` is empty, `lookup(afr, "die")` gives one row | afr | neutral | pending | 30 | — | An empty UW is not in the UW index. |
| T108 | `eng: die u1 3` `afr: die - 0` | `lookup(afr, "die")` gives one row, the closed-class one. `lookup(eng, "die")` gives one row, `u1` | eng, afr | neutral | pending | 30 | — | 805 headwords sit in both dictionaries, so a lookup must name its language. |
| T33 | Two entries equal in all but `source` | Two rows | compile | neutral | n/a | 29 | — | eng holds 1,051 such groups and afr 4,355. A D-rule deletes one reading at a time, so the count is behaviour. |
| T34 | Two entries with one `id`, different headwords and UWs | Two rows, each with that `id` | compile | neutral | n/a | 29 | — | `id` is no key. 188,907 eng ids repeat. |
| T35 | `features: {LEMMA: "'n", BF: "'n", LEX: D}` | Three pairs in that order: `LEMMA='n`, `BF='n`, `LEX=D` | compile | neutral | pending | 29 | — | Quotes come off, and order holds. `Feature` keeps store order. |
| T36 | `features: {LEX: D, att: "@def"}` | Two pairs, the second `att=@def` | compile | neutral | pending | 29 | — | `make_forest` moves an `att` value into `attributes`, so the value must reach it unchanged. |
| T37 | `uw: "book(icl>publication)"` | The UW is byte-identical | compile | neutral | n/a | 29 | — | A fixture UW holds brackets and `>`. |
| T38 | Headword `foto's`; headword `é` | Both are byte-identical in `lookup(afr, ...)` | afr | neutral | pending | 30 | — | An apostrophe and non-ASCII bytes through the `uint64_t` pool. |
| T39 | `frequency: 0`, `priority: 0`; `frequency: 255`, `priority: 255` | Both pairs read back unchanged | compile | neutral | n/a | 29 | — | The two ends of one byte. |
| T40 | The object of each `tables_<iso3>_*.cpp` | `readelf -S` lists no `.init_array`, and no non-empty `.data`, `.bss` or `.data.rel.ro`. `readelf -r` lists no relocation | compile | neutral | n/a | 29 | — | These arrays hold no pointers. `rules.cpp` and `tables.cpp` do hold pointers, so `.data.rel.ro` is allowed there, and `.init_array` is not. |
| T41 | Every `tables_<iso3>_*.cpp` | The text `archive_path` does not appear | compile | neutral | n/a | 29 | — | `source` stays out of the tables, as it does in `DictionaryEntry`. |
| T42 | eng rule `26` of `analysis.yaml`: `lhs: "(TIME,^\"/\\d\\d\\:\\d\\d\\:\\d\\d/\")"` | The table's `lhs` equals the bytes `(TIME,^"/\d\d\:\d\d\:\d\d/")` | compile | neutral | pending | 29 | — | Quotes and backslashes, through YAML unescaping and C++ escaping, must end identical. |
| T43 | afr rule `M3`: `rhs: "SNG:=0>\"\";PLR:=0>\"e\";"` | The table's `rhs` equals the bytes `SNG:=0>"";PLR:=0>"e";` | compile | neutral | pending | 29 | — | An inflection branch's trailing `;` must survive (F6). |
| T44 | eng `analysis.yaml`, where `id: "26"` comes before `id: "182"` | Rows hold that order | compile | neutral | pending | 29 | — | File order, not numeric order. The first-match loop reads this order, so it decides the trace. |
| T109 | `eng` and `afr` each with an `analysis.yaml` rule of id `1`; a `generation.yaml` rule with `kind: default` | Each language holds its own `analysis` array. The `default` rule sits in the `generation` array | compile | neutral | n/a | 29 | — | 356 `(file, id)` pairs repeat across languages, and `kind` is `default` on 666 rows. Only the array names the list. |
| T45 | Every rule list of `RuleSet::load(from, to)`, seven in all, against the same lists read from the tables | Equal: `id`, `kind`, `lhs`, `rhs`, `comment` on every rule, in every list | eng-afr | neutral | n/a | 30 | — | The whole claim of ADR 0028's decision 1 for one tier. Runs on the fixture and on `basic`, on every branch. |
| T46 | A grammar file holding no rules | An empty rule list, no error | compile | neutral | n/a | 29 | — | `xxa`'s `disambiguation.yaml` holds none, and that is its proof. |
| T47 | A store with `grammar/generation.yaml` absent | The compiler fails, and writes nothing | compile | neutral | n/a | 29 | — | Matches quest 210's load failure. A table built from a damaged store must not exist. |
| T48 | The same store, compiled twice | Byte-identical output | compile | neutral | n/a | 29 | — | Quest 29's own criterion. Covers every generated file. |
| T49 | One `priority` changed in a store | One row file differs on one row, and the header's source hash changes | compile | neutral | n/a | 29 | — | A later row must not move. Prototype: one line of diff. |
| T110 | One new string in the eng slice | The eng files change. No `tables_afr_*.cpp` file changes, apart from the header's source hash | compile | neutral | n/a | 29 | — | Per-language arrays limit a dictionary change's cost in git. |
| T116 | `--tier phone`, then `--tier connected` | The two folders' files are equal, apart from each header and the tier name | compile | neutral | n/a | 29 | — | Label `data`. Owner's R4: only eng and afr exist, and no corpus table. This row fails when Dutch arrives at M6, and M6 removes it. |

### Back end: `Engine::generated`

| id | input | expected | direction | register | review | quest | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| T50 | Every row of `24-test-cases.md` on `basic` | Text and status equal that table. A deferred row prints DEFERRED, as `testing.md` says | eng-afr | neutral | confirmed (24 A01 to A15) | 30 | S5, S6 | Quest 30's own criterion. This is the proof a fixed-set word stayed in. |
| T51 | `the book` | `die boek`, `ok` | eng-afr | neutral | confirmed (24 A02) | 30 | S5 | `die` is a closed-class record at frequency 0. |
| T52 | `books` | `boeke`, `ok` | eng-afr | neutral | confirmed (24 A04) | 30 | — | `boeke` needs `afr-inf-M3` from the rule table, and `boek` from the dictionary table. |
| T53 | `the beautiful car` | `die mooi motor`, `ok` | eng-afr | neutral | confirmed (24 A11) | 30 | S1 | The owner's `motor`. It needs both `kar` and `motor` kept, with their priorities. |
| T54 | `John and Mary` | `John en Mary`, `ok` | eng-afr | neutral | confirmed (24 A13) | 30 | — | `John` must not take the entry for `john`. |
| T55 | `slumbrous` on `basic` | `⟦slumbrous⟧`, `partial` | eng-afr | neutral | pending | 30 | S2 | Outside the tier. SPEC §3.4's mark, with the source surface. |
| T56 | `slumbrous` on `phone` | `⟦slumbrous⟧`, `partial` | eng-afr | neutral | pending | 31 | S2 | Label `data`. Inside the tier, but with no partner, so ADR 0025 marks it. The word's own text is the same on both tiers. Dropping it can still change a neighbour's text (ADR 0028, decision 2). |
| T102 | `German` on `basic` | `⟦German⟧`, `partial` | eng-afr | neutral | pending | 30 | S8 | The owner's R1. The pin holds its record, so it does not become a bare name. It goes red if capitals are ever cut. |
| T103 | `German` on `phone` | `⟦German⟧`, `partial` | eng-afr | neutral | pending | 31 | S8 | Label `data`. A record with no afr word. T102 and this row must agree. |
| T105 | `Slumbrous` on `basic` | `Slumbrous`, `ok` | eng-afr | neutral | pending | 30 | S8 | No capitalised entry exists, and `basic` cut `slumbrous`, so the engine has no record: a name, by quest 207's ruling. R1 cannot close this. ADR 0028 states it, and the owner reads this row. |
| T106 | `Slumbrous` on `phone` | `⟦Slumbrous⟧`, `partial` | eng-afr | neutral | pending | 31 | S8 | Label `data`. The retry finds `slumbrous`, so the record marks it. The two tiers differ, as T105 states. |
| T57 | `any book` on `basic` and on the runtime back end | `text`, `unl`, `trace`, `status` equal | eng-afr | neutral | pending | 30 | S1 | An entry-level cut gives `boek`, status `ok`, and loses `any`. This row goes red if whole headwords are ever broken. |
| T58 | `kano zuma sona` | `hundo kinda vidra`, `ok` | xxa->xxb | neutral | n/a | 30 | — | A01 of `04-test-cases.md`, on the fixture build. |
| T59 | `sona zuma glimu` | `kinda vidra ⟦glimu⟧`, `partial` | xxa->xxb | neutral | n/a | 30 | — | A09 of that table, owner ruling 2026-11-04 (ADR 0029). A word in no dictionary, its mark appended by ADR 0025. |
| T60 | `sona zuma veri` | `kinda ⟦veri⟧ vidra`, `partial` | xxa->xxb | neutral | n/a | 30 | — | A11 of that table. Analysis succeeds, and generation has no word. |
| T61 | `kano` | `hundo`, `ok` | xxa->xxb | neutral | n/a | 30 | — | A12 of that table, owner ruling 2026-11-04 (ADR 0029). One noun translates, as eng A01 does. |
| T62 | A binary linked to `verstaan_data_fixture`, asked for `Tier::basic` | The fixture's tables serve the call | xxa->xxb | neutral | n/a | 30 | — | `Tier` gains no test-only member. |
| T63 | A binary linked to `verstaan_data_basic`, asked for `Tier::phone` | A load failure, in the form quest 210's ADR gives. `translate` never runs | eng-afr | neutral | n/a | 30 | — | Never serve another tier's tables under its name. Not `not_implemented`, which gate step 0 refuses in `engine/src`. |
| T115 | `verstaan_cli`, which never calls `Engine::generated` | Links with `verstaan_core` alone. `nm -u` lists no `generated_tables` | build | neutral | n/a | 30 | — | A runtime-only binary links nothing extra (ADR 0028, decision 1). Red proof: call `Engine::generated` from it, and the link fails. |

### Allocation: the scope of "no allocation after load"

Each row counts `operator new` in the test binary, after `Engine::generated(Tier::basic)` returns.

| id | input | expected | direction | register | review | quest | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| T64 | `lookup(eng, "book")` on the table, 26 entries | 0 allocations | eng | neutral | n/a | 30 | — | The runtime path costs 2,855 today. |
| T65 | `lookup_uw(afr, "102870092")` on the table, 3 entries | 0 allocations | afr | neutral | n/a | 30 | — | The runtime path costs 18 warm and 36,130 cold. |
| T66 | `lookup(eng, "xyzzyq")`, absent | 0 allocations, empty | eng | neutral | n/a | 30 | — | A miss costs nothing either. |
| T67 | `translate("the book")` three times | All three counts are equal, and each gives `die boek` | eng-afr | neutral | confirmed (24 A02) | 30 | — | A cache that fills on first use shows between the first two counts. One that grows per call shows between the last two. |
| T68 | `translate("book")` | Under 12,230 allocations, the cost of parsing the rules today | eng-afr | neutral | confirmed (24 A01) | 30 | — | Fails while `translate` parses rule text, even with the store gone. About 2,000 is expected (ADR 0028, estimated). |
| T69 | `translate("the book")` with `data/languages/` unreachable | `die boek`, `ok` | eng-afr | neutral | confirmed (24 A02) | 30 | — | `translate` opens no file, and load reads no store. Quest 210 tests the runtime side. |
| T70 | `static_assert` on `decltype(Result::text)` being `std::string`, and `Result` having its four fields | Compiles | build | neutral | n/a | 30 | — | `Result` keeps its shape, as ADR 0028 says. Must-not row for an API change hidden in this quest. |

### Equivalence

| id | input | expected | direction | register | review | quest | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| T71 | Each of the 248 lines of `data/languages/eng/corpus/ugoa1.yaml`, runtime against `phone` | `text`, `unl`, `trace`, `status` equal | eng-afr | neutral | n/a | 31 | — | Label `data`. A wrong translation in both still passes, as quest 31 says. 18 lines repeat a sentence, because their UNL differs, so 230 inputs are distinct. |
| T72 | All 17 rows of `04-test-cases.md`, runtime against the fixture build | The same four fields equal | xxa->xxb, xxb->xxa | neutral | n/a | 31 | — | On every branch. |
| T73 | A diff of two `Result` values, unequal in `text` only | Fails, naming `text` | unit | neutral | n/a | 31 | — | |
| T74 | Two `Result` values, unequal in `unl` only | Fails, naming `unl` | unit | neutral | n/a | 31 | — | |
| T75 | Two `Result` values, unequal in `trace` only | Fails, naming `trace` | unit | neutral | n/a | 31 | — | SPEC §3.4 omitted this field until ADR 0028. |
| T76 | Two `Result` values, unequal in `status` only | Fails, naming `status` | unit | neutral | n/a | 31 | — | ADR 0028 adds it to ADR 0007's three. |
| T77 | One hand-altered rule row in the generated fixture `rules.cpp` | The suite fails on a row that fires that rule. Restore, and it passes | xxa->xxb | neutral | n/a | 31 | — | Quest 31's red proof. Paste the failure. A `priority` will not do, because every fixture UW has one reading. |
| T78 | Every equivalence case | The case asserts the name `generated_tables()` reports is `fixture` or `phone`. Linked to `basic`, it fails | unit | neutral | n/a | 31 | — | `basic` differs from the full store on 5 of 248 sentences by selection alone. A check on the test's name would pass a misnamed case. Prove it red by linking `basic`. |
| T79 | The `data` job with the `phone` case unregistered | The job fails | branch | neutral | n/a | 203 | — | A skip looks like a pass, the trap ADR 0013 records. Prove it red. |

### What a branch compiles

`expected` names what Python compiles, then what step 6 checks with `git status --porcelain`. Real means
fixture, `basic`, `phone`, `connected`. Quest 29 runs each row against `--changed --base`, and quest 203
runs a real branch for two.

| id | input | expected | direction | register | review | quest | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| T80 | `docs/adr/0001.md` changed | fixture; check fixture | branch | neutral | n/a | 29 | — | |
| T81 | `engine/src/generation.cpp` changed | fixture; check fixture | branch | neutral | n/a | 29 | — | Shared code moves both back ends alike, so the 248-sentence diff would show nothing. |
| T113 | `engine/src/dictionary_lookup.cpp` changed | real; check fixture and `basic` | branch | neutral | n/a | 29 | — | The owner's R2. A store reader can part the back ends. |
| T114 | `engine/src/rule_interpreter.cpp` changed | real; check fixture and `basic`, until quest 210 moves `read_grammar_file`. Then fixture; check fixture | branch | neutral | n/a | 29 | — | Quest 210 replaces the list's line and changes this row in the same commit. |
| T82 | `tests/fixtures/languages/xxa/dictionary/b.yaml` changed | fixture; check fixture | branch | neutral | n/a | 29 | — | The changed fixture output must be committed in the same branch. |
| T83 | `data/languages/eng/dictionary/b.yaml` changed | real; check fixture and `basic` | branch | neutral | n/a | 29 | — | |
| T84 | `data/languages/afr/grammar/generation.yaml` changed | real; check fixture and `basic` | branch | neutral | n/a | 29 | — | |
| T85 | `tools/compiler/cli.py` changed | real; check fixture and `basic` | branch | neutral | n/a | 29 | — | |
| T86 | `tiers.toml` changed | real; check fixture and `basic` | branch | neutral | n/a | 29 | — | |
| T87 | `tests/equivalence/any_test.cpp` changed | real; check fixture and `basic` | branch | neutral | n/a | 29 | — | The 248-sentence diff needs `phone`. |
| T88 | A hand edit in `engine/generated/basic/tables_eng_rows.cpp` | real; step 6 fails | branch | neutral | n/a | 29 | — | Quest 203 repeats this as its red proof. |
| T89 | A hand edit in `engine/generated/fixture/rules.cpp` | fixture; step 6 fails | branch | neutral | n/a | 29 | — | Caught with no real-store compile. |
| T111 | `engine/generated/basic/rules.cpp` removed from git and committed | real; the compiler writes it again, untracked, and step 6 fails | branch | neutral | n/a | 29 | — | `git diff --exit-code` exits 0 on this. `git status --porcelain` does not. |
| T118 | A hand edit in `tests/golden/basic/` | real; step 6 fails | branch | neutral | n/a | 29 | — | Committed golden rows sit under the same check. |
| T90 | A path with a listed prefix as a substring only: `docs/data/languages/note.md` | fixture; check fixture | branch | neutral | n/a | 29 | — | Prefix match from the root, not a substring match. Must-not row. |
| T112 | `--changed --base nosuchref` | Exits non-zero and writes nothing. It does not compile the fixture alone | branch | neutral | n/a | 29 | — | A ref that does not resolve must not read as "nothing changed". `tools/validate/cli.py:100-114` raises the same way. |

### A clean checkout

| id | input | expected | direction | register | review | quest | rule ids | note |
|---|---|---|---|---|---|---|---|---|
| T91 | `cmake -S . -B build/t` on a clean checkout | Configures, and builds `fixture` and `basic` with no Python | build | neutral | n/a | 29 | — | ADR 0003's reason, kept for the committed tiers. |
| T92 | `cmake -S . -B build/t -DVERSTAAN_TIERS=phone` with no `engine/generated/phone/` | Configure fails, and the message names `python -m tools.compiler --tier phone` | build | neutral | n/a | 29 | — | Never a silent skip. |
| T93 | `python -m tools.compiler --tier phone`, then T92's command | Configures and builds `verstaan_data_phone` | build | neutral | n/a | 29 | — | The route for each uncommitted tier. Quest 31 and quest 32 use it. |
| T94 | T93, then `git status --porcelain` | Empty | build | neutral | n/a | 29 | — | `.gitignore` excludes `phone` and `connected`, or the gate refuses its stamp for a dirty tree. |
| T117 | T93, then a look for `tests/golden/phone/`, then `ctest -N -L golden` | The folder does not exist, and the case count equals the count before T93 | build | neutral | n/a | 29 | — | Golden rows follow committed tiers, because `row_loader.hpp:168` loads every text file there. |
| T95 | `python -m tools.compiler --all-tiers` | Writes fixture and `basic`, and writes no `phone` or `connected` | compile | neutral | n/a | 29 | — | Quest 29's "each tier quest 27's ADR commits". |
| T119 | `cmake -S . -B build/t -DVERSTAAN_TIERS=fixture` | Builds no `verstaan_data_basic`, and the fixture's generated-tables cases run | build | neutral | n/a | 29 | — | The owner's R3, the MSVC fallback. Quest 29 applies it only if MSVC fails. |
| T120 | `build.ninja` after T93 with `VERSTAAN_TIERS=basic;phone` | Every compile of a table file sits in one pool of depth 1 | build | neutral | n/a | 29 | — | Table files compile one at a time, across tiers. One compile peaks at 2,339 MB on GCC. |

119 rows, T01 to T120. T96 to T120 came after the first draft, so some sit out of number order beside
the rows they belong with. T104 is not used.
