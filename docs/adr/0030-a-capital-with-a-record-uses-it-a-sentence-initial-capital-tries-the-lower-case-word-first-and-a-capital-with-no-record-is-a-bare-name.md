# 0030 — A capital with a record uses it, a sentence-initial capital tries the lower-case word first, and a capital with no record is a bare name

Date: 2026-11-05 · Status: Accepted, owner, 2026-11-05.

## Context

`apply_name_literals` in `engine/src/engine.cpp` decides what a capitalised token is. Before this quest
no ADR owned that decision. Finding F10 of issue 188's verifier report names the gap in two parts. F10.1 asks
who is a name: the noun-only test, the hard-coded `"I"` and the ASCII capital test. F10.2 asks why every
name literal carries a bare `TEMP` tag, in the literal branch of `build_positions`.

The scene from finding F2: a user types an ordinary English sentence with a capital first letter.
`a book` gives `'n boek`. `A book` gives `boek van A`, "book of A", with exit 0. The store holds `A` as
a noun (`data/languages/eng/dictionary/a.yaml:2`), so the exact-case hit wins and the article never gets
its turn. No golden row sees this, because the fixed-set inputs start in lower case.

ADR 0025's amendment of 2026-11-04 left one more question to this ADR. A09 reads
`'n boek oor ⟦Geneva⟧`, partial, and A13 reads `John en Mary`, ok. The engine had to tell the two apart.

The owner ruled on the mechanism on 2026-11-04: **a place is a record.** A capitalised word with an
English record uses that record. When Afrikaans has no record for that UW, the word shows marked. A
capitalised word with no record is a name, and shows bare. The rule needs no person list. The owner also
ruled that the lower-case word wins on a sentence-initial capital, so `Car` gives `motor`.

Those two rulings met on `John`. `John` has no exact-case record, but `john` has one (`j.yaml:23034`, UW
`104446276`), and afr maps it to `kleinhuisie`. A user types `John and Mary`. With the lower-case word
always first, the screen shows `kleinhuisie en Mary`, "toilet and Mary", with exit 0. `john` and `car`
have the same shape: both are noun-only, and both have an afr partner. The field that separates them is
`priority`, 0 against 17. The owner ruled on this on 2026-11-05, and step 1 below carries the ruling.

## Decision

### F10.1: who is a name

Capitalised means the first character of the token is Unicode `Lu`. This is the test in SPEC §3.5. The
engine has no difference to name: §3.5 adds "no space" because a headword can hold a space, and a token
never does. So SPEC §3.5 does not change. `engine.cpp`'s ASCII test goes.

The engine takes each capitalised token through these steps.

| Position | Step | Result |
|---|---|---|
| Later in the sentence | Read the exact form. | A record: use it. No record: a name. |
| Sentence-initial | Read the lower-case form first. Then read the exact form. | See below. |

A sentence-initial token compares the two lookups.

1. A lower-case form that is noun-only with `priority` 0 on every entry counts as no word.
2. Neither form has a record: the token is a name.
3. Only one form has a record: the token uses that record.
4. Both forms have a record: the exact form wins only when its best `priority` is strictly higher.
   Otherwise the lower-case form wins, a tie included.

The tie is the rule-author's reading of the owner's "the lower-case word must win". The owner confirmed it
on 2026-11-05. A record leaves the tie when its `priority` rises, with no engine branch.

The lower-case form changes the first character only. A character that is `Lu` with no lower-case
mapping has no lower-case form, so only the exact form is read.

The decoder reads the first character as UTF-8. Malformed bytes are no capital: a cut sequence, an overlong
form, a surrogate and a value above U+10FFFF. `E0 81 81` is an overlong form of `A`, and it must not find
the article.

The surrogate and range checks have no effect through `translate`, because U+D800 and values above U+10FFFF are
not `Lu`. They hold the decoder's contract: `length` 0 means malformed, and a returned `code` is a scalar value,
which `append_utf8` requires. Row C57 tests the decoder directly, so it can fail.

When the lower-case form wins, the candidate's surface is the lower-case form. A grammar rule that reads
`[all]` must see `all`. A mark still shows the word as the user typed it, as ADR 0025 says.

The noun-only test narrows. It kept `John` bare, and it also kept `Car` bare. Now it applies only to a
form with `priority` 0 on every entry, so `John` stays a name and `Car` finds `car`. The hard-coded `"I"`
goes. `i` is noun-only at 0, so step 1 removes it and the `I` records stand, which hold the pronoun. SPEC
§1 forbids a branch that names a language. `A` is 0 against `a` at 255, so the article wins.

### F10.2: the `TEMP` tag

`TEMP` stays on a name literal and goes nowhere else. The archive defines it:
`data/archive/wiki/English_grammar_Temporary_entries.wikitext` line 1 says a temporary entry is not
expected to be translated, and line 4 says the UNL shows it between quotes. `eng-ana-182` reads the tag
and gives the literal `LEX=N` and `POS=PPN`. A dictionary record never carries `TEMP`, so a record with a
capital takes none of those rules. `eng-ana-183` now reads `{TEMP|POS=PPN}`, so it reaches a literal and
the `Geneva` record alike.

### Each output

`docs/factory/issues/207-test-cases.md`, block C, holds the row for each one and wins over this table.

| Input | Output | Status | Why |
|---|---|---|---|
| `a book about Geneva` | `'n boek oor ⟦Geneva⟧` | partial | English record `500004419`, added here. Afrikaans has none. |
| `Paris` | `⟦Paris⟧` | partial | English record `112469372`. Afrikaans has none. |
| `a book about Paris` | `'n boek oor ⟦Paris⟧` | partial | A later capital consults the dictionary. |
| `a book about Brisbane` | `'n boek oor Brisbane` | ok | No record. A new-world place keeps its own, as the owner ruled on 2026-10-29. |
| `a book about Lyon` | `'n boek oor Lyon` | ok | No record. The owner accepted this cost; quest 217 adds the corpus's places. |
| `John and Mary` | `John en Mary` | ok | `john` counts as no word, and `John` has no record. |
| `a book about Einstein` | `'n boek oor ⟦Einstein⟧` | partial | English record `110126926`. Afrikaans has none. The owner accepted this on 2026-11-05. |
| `A book` | `'n boek` | ok | `a` beats `A` on priority. |
| `All the books` | `al die boeke` | ok | The surface is `all`, so `eng-dis-6` fires. |
| `Car` | `motor` | ok | The lower-case form is the only record, at `priority` 17. |
| `Cars` | `motors` | ok | The same. |
| `Children` | The output of `children` | ok | The same. Quest 209 owns that plural. |
| `The Book` | `die Book` | ok | `Book` has no record. See "A determiner stays on a name". |
| `the Car` | `die Car` | ok | `Car` has no record. A later capital takes no lower-case lookup. |
| `HELP` | `HELP` | ok | `hELP` has no record. The owner accepted this on 2026-11-05. |
| `Xyzzy` | `Xyzzy` | ok | No record. |
| `Émile` | `Émile` | ok | `É` is `Lu`. No record. The owner ruled a person's name stays bare. |

### Three months outrank the lower-case form

The owner ruled on 2026-11-05 that `March`, `May` and `August` read as the month at the start of a sentence.
Each English record gets a raised `priority`, so step 4 keeps the exact form. The engine gains no branch.

| Record | `priority` | Lower-case form | Output | Before this quest |
|---|---|---|---|---|
| `March` | 6 to 7 | `march` at 6 | `Maart` | `Maart` |
| `May` | 0 to 1 | `may` at 0 | `Mei` | `Mei` |
| `August` | 0 to 1 | `august` at 0 | `Aug` | `Aug` |

Each value is the smallest that wins, because `priority` has one other reader. ADR 0023's lexical choice
takes the highest-priority lemma entry for a UW in the target store. The shipped pair has `afr` as its
target, so these `eng` values change no output there. If English becomes a target, `March` still beats
`Mar`, `May` still comes before `may` in store order, and `August` now beats `Aug`. That last change is right.

`August` gives `Aug`, and that is a defect. Afrikaans holds `Aug`, `LST: ABB`, and `Augustus`, both at
`priority` 0, and ADR 0023's tie takes the first in store order. Correct Afrikaans is `Augustus`. This quest
does not fix it, and no row pins `Aug`.

A sentence that starts with the verb reads the month. `March on` gives `Maart aan`. The owner accepted this
cost.

**A re-import overwrites an edited `priority`.** `tools/importer/dictionary.py` writes each shard whole, from
the archive. A re-import restores the archive value and the archive `source`, and it drops records with no
archive line, such as `Geneva`. ADR 0020 already says a re-import must re-apply each `original` record. This
ADR extends that rule to these dictionary records. Each one sets `archive_path: original`, and its `line`
note says what changed: "priority 6 raised to 7", the ruling and the archive line it adapts. A search for
`archive_path: original` lists them.

ADR 0023 rejected raising `kar` and `doos`, because a dictionary record had no such marking. This ruling
marks three records and leaves that choice alone. `docs/standards/data.md` names grammar rules as the one
exception to its record rule, so it needs this second exception.

### `God` gets the first record with a quoted UW

The owner ruled on 2026-11-05 that `God` shows as `God`, by a raised `priority`. The store held no bare `God`
record to raise, so the owner chose a new one: UW `"God"`, with its quotes, `priority` 9. It is the first
record in the store with a quoted UW. The exact record is in `207-test-cases.md`.

Step 4 keeps the exact form, because 9 beats `god` at 8. The node is `"God"`, so generation treats it as a name
literal, and ADR 0025 shows it as itself. So `God` gives `God`, and `a book about God` gives `'n boek oor God`,
both `ok`. `Einstein` keeps a plain UW, so it stays marked. The record carries no `TEMP`, so `eng-ana-182` stays
silent. It carries `POS: PPN`, so `eng-ana-183` reads it.

Lower-case `god` still gives `beeld`. `god` has no capital, so it takes no capital path. A lookup is
case-sensitive, so it reads the six `god` entries and never this record.

The record has no archive line, so a re-import drops it, and ADR 0020's re-apply rule covers it. One record
makes no person list. Each later record of this shape needs its own ruling.

### `eng-dis-11` reads a later capital

A later capital with a record is no literal, so `eng-dis-4` no longer keeps `about` as a preposition before it.
`eng-dis-11` does that work. It must not fire on an ordinary noun, for this reason: `eng-ana-15` places the
preposition, and it cannot fire before a full stop, because a punctuation token carries no feature. A user types
`a book about cars.`, and the wide rule gives `'n boek motors`, with exit 0.

No feature tells a later capital from an ordinary noun. `Einstein`'s and `Paris`'s feature sets each also stand on
a lower-case noun. So the engine gives a bare `CAP` tag to a later capital whose every reading is `LEX=N`, and the
rule reads `([about],^POS=PRE)(N,CAP,#PREFERRED)`. No other rule names `CAP`, and no tagset or dictionary file
does, so only this rule can see it.

`docs/standards/data.md` says a feature comes from `tagset.yaml`. `CAP` does not, and this is why it may differ:
the engine sets it on a candidate at run time, and no store record holds it. The validator reads store records,
so it never meets `CAP`. `data.md` gains an exception that says so.

The all-noun test matters. `English` and `I` each have a reading that is no noun, and the pass picks that reading,
so `eng-ana-15` or `afr-gen-4` could not use the preposition. They carry no tag, and `about` stays visible:
`a book about English` gives `'n boek Engels ⟦about⟧`, and `about I` gives `om ⟦I⟧`.

Of the 9,593 all-noun capitals, 9,588 read `oor`, as in main. The other five are in the list under Consequences.
An ordinary noun keeps main's reading, so `a book about cars` gives `'n boek om motors`. The owner accepted `om`
there on 2026-11-05.

### A15's name node

A15's name node is UW `112469372`, the eng store's `Paris` record. It is not the corpus's `500003943`,
which no dictionary holds. Afrikaans has no record for `112469372`, so the node shows `⟦Paris⟧`. Quest
201 builds the graph around this node, and quest 215 writes the rest of the text. Quest 217 says which
UW the Afrikaans record carries.

`SEM: PLA` on this record means "plant" in `tagset.yaml`, and `PLC` means "place". The UW is the herb
genus `Paris`, as `dictionary_lookup_test.cpp:126` already notes. The ruling stands on the record it
names, and quest 217 meets this fact when it chooses the shared UW.

### A determiner stays on a name

`the Car` keeps its article and gives `die Car`. Today it gives `Car`, so the text loses a source word
with status `ok`, the loss ADR 0025 rejects. `afr-gen-35` and `afr-gen-36` widen to `{N|^LEX}`, the shape
issue 182 gave `afr-gen-4`. The widening reaches a node with no target entry too, so row N53 reads
`'n ⟦box⟧`. It also reaches a verb with no target entry. 258 of 38,136 matrix inputs differ, all `partial` in main
and now. `the book runs` was `⟦runs⟧ ⟦book⟧`, and now gives `die ⟦runs⟧ van boek`.

### Only the first character folds

The owner accepted this on 2026-11-05. `HELP` shows `HELP`. A full fold would read `US` as `us` and `WHO` as `who`, and neither is rare. An
all-capital word and an abbreviation have the same shape, and the store cannot tell them apart. So the
engine leaves them alone.

### Unicode without a port dependency

`docs/standards/cpp.md` allows the engine no port dependency, so ICU is out. The engine holds one sorted
table of the `Lu` code points and their simple lower-case mappings. The table is fixed at Unicode 16.0, with
1,858 `Lu` code points. A pytest checks the table against whichever Unicode version the running Python
carries. CI's Python 3.13 has Unicode 15.1, with 1,831 `Lu` code points. Quest 29's capital pin reads the
Python that runs the compiler, so a newer or older Python can differ from the table on a code point that
Unicode added between the two versions.

### SPEC

The mechanism adds no store file, so SPEC §3.3 does not change. `Geneva` is one more record in
`dictionary/g.yaml`. SPEC §3.5 does not change, as F10.1 above states.

## The accepted cost of the lower-case test

The owner accepted this cost on 2026-11-05, on the figure 65,129. So `Dad`, `Auto` and `Anatomy` show bare with
exit 0, as they do today. `Peter`, `Henry`, `Victor` and `Mike` show bare too, and that is the purpose of the
test.

Each figure below counts headwords in the eng store whose first character is `Ll` and that hold no space.

| Figure | That set, as the owner saw it | Without the six below |
|---|---|---|
| Noun-only | 68,782 | 68,776 |
| Noun-only at `priority` 0, so no word | 65,129 | 65,123 |
| Of those, also with an exact-case record, which stands as it does today (`Comrade` shows `⟦Comrade⟧`) | 475 | 475 |
| Of those, with no exact-case record, so bare | 64,654 | 64,648 |

Six headwords end in a full stop: `lbf.`, `no.`, `oz.`, `s.t.p.`, `ux.` and `var.`. The tokeniser splits each
one, so no token can equal it. The right column is the set a token can reach, and it is the verifier's count.
The owner's 65,129 includes the six, and no output differs.

## `New York`: quest 217 owns it

The owner ruled on 2026-11-05 that quest 217 owns `New York`. This ADR pins no output for it, and quest 207
has no test on it. `New` has an English record (`n.yaml:3914`), so the rules above read it as a word.

Until quest 217 lands, `a book about New York` prints `'n boek nuut ⟦about⟧ ⟦York⟧`, `partial`. This is a known result and not a
ruling. No test holds it.

## Rejected

| Option | Why not |
|---|---|
| The exact form first (today's order) | `A book` stays `boek van A`. The store holds `A` as a noun. |
| A list of people, or a new store file of names | The owner ruled the rule needs no person list. The list also grows without an end. |
| The corpus's shape decides | The corpus gives `Shakespeare` a UW and most people quoted literals. The owner ruled the store decides. |
| Keep the noun-only test as it is | `Car` stays bare against the owner's ruling. |
| Fix the lost preposition in this quest: `PUT` on every punctuation token, a mark on a live preposition, `eng-dis-12`, `eng-dis-13`, `afr-gen-237`, `afr-gen-238` and `-@about` on `afr-gen-4` | Its true width is far past a capital rule. A second verifier read measured `PUT` reaching 22 analysis lines. 16,251 of 38,136 matrix sentences change. 24 of 248 corpus sentences change, and 14 of them go from exit 0 to exit 2. `John Smith.` went from right to `Smith ⟦John⟧`. The owner kept the gains for quest 220, which starts from the local branch `wip-207-put-fix`. |
| `eng-dis-11` keeps reading any noun, `(N,#PREFERRED)` | With no `PUT`, `a book about cars.` gives `'n boek motors`, `about cars` gives `motors` and `about five books` gives `vyf boeke`, all at exit 0. |
| `eng-dis-11` reads `(N,^CAR)`, `(POS=PPN)` or `(N,NUM=SNGT)` | `(N,^CAR)` still fires on `cars`, which has readings with no `CAR`, and misses `Einstein`, which holds `CAR: CTB`. The other two miss `Einstein`. `(POS=PPN)` also misses `Paris`. |
| `eng-dis-11` names `[Paris]` and `[Einstein]` | It needs no engine tag, but it names a person in a rule, and every other later capital with a record goes from main's `oor` to `om`. |
| An engine branch for the months | The owner ruled the record decides. |
| `God`: no record, and `god`'s six entries lowered from 8 to 0 | It gives the same outputs, but it lowers six archive records where the ruling raises one word, and `God` would hold no record. |
| `God`: a new record with `god`'s UW `109505418` | It gives `⟦God⟧`, `partial`, not the output the owner names. Afr has no record for that UW. |
| The lower-case test, and also `frequency` under 10 | It keeps 62,840 headwords bare, not 65,129, and `Dad` finds its word. But the threshold has no source and fits `john` at 9. A name at 10 or more reads as a word. |
| The lower-case word always wins, and the store loses `john` | A13 passes, but `Peter` reads as `peter`. Each later name needs its own deletion, which is a person list by subtraction. |
| Keep `"I"` in a branch | SPEC §1 forbids a language in a branch, and the lower-case test already gives the right answer. |
| Fold the whole token | `US` reads as `us`. See "Only the first character folds". |

## Consequences

### What gets worse against main

The owner accepts this ADR on this list. It runs in the order a user meets each case, from the first word of a
sentence to the rarer shapes. Each row is measured against `main` at `af2eba1`. Exit 0 is `ok`, and exit 2 is
`partial`.

| # | What the user types | Main | Now | Who closes it |
|---|---|---|---|---|
| 1 | A sentence that starts with a preposition: `On the table.` | `aan die tafel`, 0 | `die tafel`, 0 | Quest 220 |
|  | `In a box.` | `⟦In⟧ 'n boks`, 2 | `'n boks`, 0 | Quest 220 |
|  | `Before the summer.` | `voor die somer`, 0 | `die somer`, 0 | Quest 220 |
|  | `About God` | `om God`, 0 | `God`, 0 | Quest 220 |
|  | `About Paris` | `om Paris`, 0 | `⟦Paris⟧`, 2 | Quest 220 |
|  | `About the car` | `om die motor`, 0 | `die motor`, 0 | Quest 220 |
| 2 | A sentence that starts with a name that is also a word: `Holly` | `Holly`, 0 | `hulsboom`, 0 | The rule, as ruled. No quest. |
|  | `Penny` | `Penny`, 0 | `⟦Penny⟧`, 2 | The rule, as ruled. No quest. |
|  | `Turkey` | `Turkey`, 0 | `kalkoen`, 0 | The rule, as ruled. No quest. |
| 3 | A name after a title: `Mr. Holly` | `Meneer Holly`, 0 | `Meneer hulsboom`, 0 | Quest 221 |
| 4 | A name initial: `A. Smith` | `A Smith`, 0 | `Smith`, 0 | Quest 221 |
|  | `Mr. A` | `Meneer A`, 0 | `Meneer`, 0 | Quest 221 |
|  | `P.A.` | `P A`, 0 | `P`, 0 | Quest 221 |
|  | `D.A.` | `D A`, 0 | `D`, 0 | Quest 221 |
|  | `the book. A` | `die boek A`, 0 | `die boek`, 0 | Quest 221 |
|  | `A`, `A.` or `A?` alone | `A`, 0 | Nothing, 0 | No quest. It matches `a` (ADR 0019, row N19). |
| 5 | A language or a nationality after a preposition: `a book about Afrikaans` | `'n boek oor Afrikaans`, 0 | `'n boek ⟦Afrikaans⟧ ⟦about⟧`, 2 | Quest 222 |
|  | `a book in English`, corpus line 126 | `'n boek aan English`, 0 | `'n boek Engels ⟦in⟧`, 2 | Quest 222 |
| 6 | A capital that is a verb record: `a book about Ask` | `'n boek oor Ask`, 0 | `'n boek vra om`, 0, wrong with no mark | Quest 222 |
|  | `a book about Emerge` | `'n boek oor Emerge`, 0 | `⟦Emerge⟧ ⟦book⟧ ⟦about⟧`, 2 | Quest 222 |
| 7 | A capital that spells a grammar tag: `a book about D` | `'n boek oor D`, 0 | `'n boek D`, 0, `about` lost with no mark | Quest 222 |
|  | `a book about DP` | `'n boek oor DP`, 0 | `'n boek ⟦DP⟧`, 2 | Quest 222 |
| 8 | A person with a record: `a book about Einstein` | `'n boek oor Einstein`, 0 | `'n boek oor ⟦Einstein⟧`, 2 | The rule, as ruled. No quest. |
| 9 | A sentence around `Paris`: `as beautiful as Paris` | `gelyk mooi ⟦as⟧ ⟦Paris⟧`, 2 | `⟦Paris⟧ ⟦as⟧ ⟦beautiful⟧ ⟦as⟧`, 2 | Quest 222. Quest 217 works on the `Paris` record. |
|  | `a book about old Paris` | `'n boek ou ⟦about⟧ ⟦Paris⟧`, 2 | `ou ⟦Paris⟧ ⟦book⟧ ⟦about⟧`, 2 | Quest 222 |
| 10 | A verb after a determiner: `the book runs` | `⟦runs⟧ ⟦book⟧`, 2 | `die ⟦runs⟧ van boek`, 2 | Quest 222 |

The rows follow.

**Row 5 is the largest.** The verifier ran each of the 10,577 capitalised single-token headwords after
`a book about`.

| Group | Size | Lose main's `oor` | Share |
|---|---|---|---|
| Every capital | 10,577 | 978 | 9.2% |
| Frequency 10 or more | 150 | 34 | 22.7% |
| With a reading that is no noun | 984 | 973 | 98.9% |
| All-noun | 9,593 | 5 | 0.05% |

The 978 split four ways. In 812, `about` shows marked and `book` stays. In 156, the parse breaks and `book` shows
marked too. In 6, the text is wrong at exit 0 with no mark. The other 4 are `DP`, `PB`, `PP` and `FTP`.

A user types `a book about Afrikaans`. Main reads `Afrikaans` as a name, so it prints `'n boek oor Afrikaans`, exit
0. Now the word has a record, and the pass picks its adjective reading. `afr-gen-4` takes only a noun or a word
with no `LEX`, so `about` has nothing to attach to, and the screen shows `'n boek ⟦Afrikaans⟧ ⟦about⟧`, exit 2.
`English`, `French`, `German`, `Dutch`, `American`, `British`, `Christian`, `New` and `Old` do the same. The cause
is the capital rule, not `CAP`, and `CAP` does not rescue them. Where the afr store holds the adjective, the word
itself improves: `English` gives `Engels` and `French` gives `Frans`. The status still falls from 0 to 2.

Quest 220 does not close this class. Its `PUT` feature and its head-less rules act on a full stop and on a word
with no head, and this word has a head. A tag on these capitals does not help either. The rule-author ran the tag
on every capital, and `a book about English` gave `'n boek ⟦English⟧`, with `about` gone. The fix needs `afr-gen-4`
to take an adjective under `cnt`, or the noun reading chosen after a preposition. Quest 222 owns this.

The same capitals lose `in` and `on`. On `a book in W`, 972 of the 1,277 capitals tried lose `aan`, each going from
exit 0 to `partial`. Main's `aan` was the wrong word, and `Engels` is right, but the status changes. So a corpus
sentence moves from `ok` to `partial`: `a book in English`, line 126. `in English` gives `Engels ⟦in⟧`,
`a book on American` gives `'n boek Amerikaans ⟦on⟧`, and `a book by Christian` gives `'n boek ⟦Christian⟧ ⟦by⟧`.

**Two classes lose a word or read wrongly at exit 0, with no mark.** An earlier version of this ADR claimed none
does, and that was false.

- `CAP` causes one, in row 7. `eng-dis-11` strips `about`, and `eng-ana-15` then does not fire: the trace of
  `a book about D` holds no `15`. The lemmas `D`, `DP`, `PB` and `PP` each spell a grammar tag, and a tag test reads
  feature values. `D` and `D's` lose `about` at exit 0. `DP`, `PB` and `PP` lose it at exit 2. These are the five of
  the 9,593 all-noun capitals, each at frequency 1.
- Capitals cause the other, in row 6, with no part for `CAP`. A verb record gives wrong text with no mark.
  `a book about Ask` gives `'n boek vra om`, and `Ask` has frequency 166. `Obey`, `Bake` and `Podcast` do the same.

Row 1's fault and the full-stop fault are older than this quest. A capital now reaches the first of them, because
the capital finds the preposition, and no rule writes a preposition with no head. `a book about Geneva.` and
`a book about Brisbane.` lose `about` in main too.

Rows C25 and C109 pin row 8 and row 4's `A`, as ruled and as `a` gives. No row pins any other text in this list as
correct. C111 asserts only that `about` stays visible, and C104 to C108 take no test.

### The other consequences

- A person with a record shows marked. `Einstein` has one, so `a book about Einstein` gives
  `'n boek oor ⟦Einstein⟧`. 2,565 capitalised headwords hold `SEM: HUM`. The owner accepted this on
  2026-11-05.
- A person's name with a lower-case word that counts as a word does not show bare at the start of a
  sentence. `Penny` gives `⟦Penny⟧` and `Holly` gives `hulsboom`; today both are bare. 3,653 noun-only
  forms have a `priority` above 0 and now find their word, as `Car` does. `Bob`, `Jack` and `Tom` have a
  reading that is not a noun, so they show `⟦Bob⟧`, `⟦Jack⟧` and `⟦Tom⟧`, as they do today. Later in a
  sentence `Bob`, `Penny` and `Holly` are bare names. `Jack` and `Tom` have exact-case records, so they
  show marked there too.
- A sentence-initial place with a lower-case homograph reads as the word. `Turkey` gives `kalkoen`,
  while `a book about Turkey` shows `Turkey`. A later `Turkey` record at `priority` 0 does not change
  the first output, because the lower-case form holds a higher priority. `China` shows bare, because
  `china` counts as no word.
- A name the pass cannot place still shows marked, as ADR 0025 says. `book Brisbane` gives
  `boek ⟦Brisbane⟧`, as today.
- `book Paris` takes `eng-ana-10`, because the `Paris` record is `POS: NOU`, and the output marks both
  words. No row pins it. `Geneva` is `POS: PPN`, so `book Geneva` keeps ADR 0025's output.
- An exact-case record loses to its lower-case form at the start of a sentence, on a tie or on priority. So
  `Earth` gives `grond`, where `a book about Earth` reads the exact record. 33 capitalised headwords with an
  Afrikaans partner lose this way, counting a headword whose first entry's UW has an afr record. Any entry's
  UW gives 45. 21 of the 33 lose on a tie: `Angle`, `Angles`, `August`, `Cretaceous`, `D`, `Earth`, `Earths`,
  `Mar`, `March`, `Marches`, `Mass`, `Masses`, `May`, `Midweek`, `Modern`, `Moon`, `Moons`, `New`, `Podcast`,
  `Wed` and `Whites`. 12 lose on priority: `A`, `As`, `Ask`, `Bake`, `Be`, `Green`, `He`, `Miss`, `Misses`,
  `Obey`, `Sat` and `White`. The owner's ruling removes `March`, `May` and `August`, which leaves 30.
  `Mar` and `Marches` stay on the list.
- A capital after a comma or a colon is a later capital, so it takes the exact form. `Well, A book` gives
  `maklik boek van A`, exit 0, and `Note: A book` gives `⟦Note⟧ boek van A`. `A` the noun stands there.
- Any full stop counts as a sentence end. So `Mr. Holly` gives `Meneer hulsboom` and `Mr. Penny` gives
  `Meneer ⟦Penny⟧`, and a name initial vanishes, as row 4 shows. The owner accepted this as a known cost in this
  quest, and quest 221 tells an abbreviation's full stop from a sentence end. No row pins these outputs, and they
  are not correct.
- `Engine::generated` meets the same rule. ADR 0028's row T105 stands: `Slumbrous` on `basic` has no
  record, so it is a name. T106 stands: on `phone` the lower-case record marks it as `⟦Slumbrous⟧`.
- Tests at `tests/unit/engine_status_test.cpp:97-102`, `:354-368` and `:516-529` change, and the
  test-cases file lists the others the issue does not name.
