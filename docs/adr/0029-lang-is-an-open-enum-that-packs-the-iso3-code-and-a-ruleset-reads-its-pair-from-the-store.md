# 0029 — Lang is an open enum that packs the iso3 code, and a RuleSet reads its pair from the store

Date: 2026-11-04 · Status: Accepted (owner decision, 2026-11-04)

## Context

`enum class Lang` holds eng, afr and nld. `Engine::translate` refuses everything but eng to afr. A third language therefore needs engine code before it translates one word. The owner chose on 2026-11-04 that the 17 xxa/xxb rows run, so that M4 proves this cost is gone before Dutch at M6.

The rule-author read every place that names a language. These are the places that decide behaviour:

| Place | What it does today | Effect on a new language |
|---|---|---|
| `Lang`, `engine.hpp:27` at base | Three closed members in one byte | `xxa` has no value at all |
| `engine.cpp:164` | Compares `from` and `to` with `Lang::eng` and `Lang::afr` | Returns `not_implemented` |
| `dictionary.hpp:39` | Defaults `DictionaryEntry::lang` to `Lang::eng` | An unset entry claims to be English |
| `inflection_syntax.hpp:22-32` | Switches on `Lang` for the code in a trace id (ADR 0024) | A new value gets an empty prefix, `-gen-01` |
| `apps/cli/src/main.cpp:38-60` | Switches on `Lang` for the store path, and tests three strings | `--from xxa` is a bad flag |
| `tests/golden/row_loader.hpp:132, :207-209` | Runs `eng-afr` only, and loads eng and afr by name | Every other row is skipped |

`RuleSet` holds two store roots and no language. So nothing in the engine knows which pair it loaded, and `engine.cpp:164` guards that gap with a literal.

ADR 0028 keys generated tables by iso3, in `tables_<iso3>_*.cpp`. So quest 30 needs a mapping from `Lang` to the code as well.

## Decision

1. **`Lang` is an open enum.** `enum class Lang : std::uint32_t { eng = 0x656E67, afr = 0x616672, nld = 0x6E6C64 };`. The value packs the three ASCII bytes of the code. A scoped enum with a fixed base holds any value of that base, so `xxa` is a valid `Lang` with no member and no edit. The file `verstaan/lang.hpp` holds it, because `engine.hpp` includes `rule_set.hpp` and `RuleSet` now names `Lang`.
2. **`lang_from_iso3(std::string_view)` returns `std::optional<Lang>`.** It accepts exactly three lower-case ASCII letters. It holds no list and reads no file.
3. **`iso3_of(Lang)` returns the code.** It returns an empty string for a value that holds no code, such as `Lang{}`. `detail::language_code` goes. `DictionaryEntry::lang` defaults to `Lang{}`.
4. **An unknown code has two forms.** `ENG`, `en` and the empty string are not codes, and `lang_from_iso3` returns no value. `zzz` is a code that no store holds. It maps to a `Lang`, and the store decides the rest. `translate` returns `not_implemented` for it, and the CLI reports a bad flag.
5. **A `RuleSet` names its pair.** `RuleSet::load` reads the `iso3` key of each root's `meta.yaml`. `from_lang()` and `to_lang()` return it, or no value for a `from_rules()` set or a store with no readable key.
6. **`translate` compares `Options` with that pair.** It returns `not_implemented` unless `from` and `to` equal `from_lang()` and `to_lang()`. The check holds no language name. The register and context checks stay until M5. `not_implemented` keeps its meaning: a combination no store covers.
7. **`Options`, `Result` and `Engine::load` keep their shape.** The members `Lang::eng`, `Lang::afr` and `Lang::nld` stay as names. No branch in `engine/src` reads them.

A reader of the trace sees the difference first. Row A01 of the fixture pair traces `xxb-gen-01` where today's code path would have no prefix to give.

## Options

| Option | What it costs | Why |
|---|---|---|
| **Open enum (chosen)** | Base width grows from 8 to 32 bits. A cast can make a value with no code, and `iso3_of` answers it with an empty string. | No call site changes: the 28 lines in `tests/unit/` that name `Lang::` and both `switch` statements compile as they stand. No generated row holds a `Lang` (SPEC §3.5), so the width reaches no table. |
| Value class with a `consteval` constructor | Rewrites each call site and both `switch` statements. | It refuses a bad code at compile time, and the open enum does not. The gain is small, because `lang_from_iso3` already guards every value that comes from a user or a file. |
| Add `xxa` and `xxb` as members | Two invented languages enter the public API, and Dutch still edits this header and the switches. | It fails the owner's reason for this quest. The rows would run, and a new language would still need engine code. |
| `std::string` in `Options` | `Options` allocates or holds a view with its own lifetime rule. A typo stays silent until a store lookup finds nothing. | It discards the type, and SPEC §3.4 writes `Lang from; Lang to;`. |
| A registry index, built at load | `Options` exists before an `Engine` does, so the registry has to be global. | `docs/standards/cpp.md` forbids global mutable state. The index would also differ per build, so a table could not hold it. |
| An enum the compiler generates from `tiers.toml` | A public header depends on generated output. | Adding a language recompiles every consumer, and ADR 0003 keeps generated data out of engine source. |
| Read the pair from the store folder name | `RuleSet::load` opens no extra file. | A deployment that copies a store to `/opt/verstaan/af` changes what the engine believes. `meta.yaml` is the store's own statement, and the validator already checks it. |

## Decision on the fixture store and three rows

The owner ruled on 2026-11-04, after the rule-author's report.

| Ruling | Text | Carried in |
|---|---|---|
| R1 | ADR 0029 is accepted as written. | This file |
| R2 | This quest rewrites the fixture store in the engine's rule syntax. The implementer applies the rule-author's draft. | `28-test-cases.md`, "Drafted fixture store" |
| R3 | A09 expects `kinda vidra ⟦glimu⟧`, `partial`. The value follows ADR 0025. | `04-test-cases.md`, `27-test-cases.md` T59, `28-test-cases.md` |
| R4 | A12 expects `hundo`, `ok`. A13 expects `kano`, `ok`. The behaviour matches eng row A01. | `04-test-cases.md`, `27-test-cases.md` T61, `28-test-cases.md` |

**Why the store changes (R2).** The plumbing alone does not make the rows run as issue 04 meant. Every fixture rule uses an invented notation, `[LEX:N]:1 [LEX:V]:2 [LEX:N]:3`, from issue 04, which came before the tree pass. `parse_rule` cannot read it, so `analyse_tree` retires each rule as `unsupported`. Four more faults sit beside it:

- `uw: null` reads as the UW `null`, so `ta` enters the graph as a node.
- `ATT` is not the key `att` that the tree pass moves onto a node's attributes.
- No dictionary entry holds `kanoki` or `hundon`, and the engine has no reverse inflection.
- The paradigm ids are `xxa-inf-01`, while `PAR` holds `P1`, so no word takes `FLX`.

A scratch probe outside the repository ran the draft through today's engine, with `Lang::eng` and `Lang::afr` standing in for the pair. All 17 rows reach the values `04-test-cases.md` now holds, with no engine change beyond this ADR.

**Why A09 changes (R3).** ADR 0019 keeps a word with no entry out of the graph, and ADR 0025 appends its mark at the end, in input order. So no rule can place `⟦glimu⟧` between two words. A11 still shows a placed mark, `kinda ⟦veri⟧ vidra`, because `veri` has an entry and its UW makes a node.

**Why A12 and A13 change (R4).** Eng row A01 translates the same shape, one noun, as `boek`, `ok`. `make_forest` always builds a readable forest. So `no_parse` means no tokens or an unreadable forest, and never a missing clause.

The owner saw the probe's text for these three rows before ruling. The authority for each value is the ruling, with ADR 0025 and eng row A01 as its reasons, not the run.

### Rejected

| Option | Why not |
|---|---|
| A second rule syntax for the fixture | It breaks ADR 0007's one semantics. |
| Mark the rows `deferred` over the old store | Quests 29 and 31 keep a subject that fires no rule. |
| Reverse ADR 0019 and ADR 0025 for unknown words, so A09 keeps its old text | It reverses two accepted decisions for one invented row. |
| A key in `meta.yaml` that says a sentence needs a clause | The engine gains a language switch that no real store uses. |

An engine rule that an empty graph from real tokens is `no_parse` cannot work: `kano` has a UW, so it is a graph node under ADR 0019, and if "empty" means "no relations" it breaks eng A01.

## Consequences

- The fixture pair holds no `no_parse` row in YAML, and its row count stays 17: fourteen `ok`, three `partial`. T59 and T61 of `27-test-cases.md` follow the rulings, so quests 30 and 31 inherit them.
- `verstaan_cli --from nld` keeps exit 1, and now names the bad flag on stderr where today it prints an empty line. The CLI refuses a code with no `meta.yaml` under `data/languages/`. Owner ruling 2026-11-04: the CLI allows eng to afr only, so it refuses every other pair after both flags parse, with one line on stderr that names the two codes, and exit 1. The engine stays language-free. Adding the Dutch store at M6 adds the store and widens that one CLI check by one line.
- The CLI cannot reach the fixture pair, because `xxa` sits under `tests/fixtures/`. That is the point of an invented pair: it never ships.
- `RuleSet::load` opens two more files. Quest 210 moves store reading out of the interpreter and takes this read with it.
- `Engine::generated` keeps its stub. Quest 30 gives it a pair from the iso3 names the data library declares, and T62 of `27-test-cases.md` still holds.
- `engine.cpp:78` still tests the English word `I`, and `engine.cpp:47` still tests ASCII capitals. Quest 207 owns both, and no fixture row reaches them.
- **Ids in the fixture store.** An analysis id is stored qualified (`xxa-ana-01`), because the engine writes an analysis id to the trace as it stands. A generation, inflection or disambiguation id is bare (`01`, `M1`), because the engine adds `<iso3>-gen-`, `<iso3>-inf-` and `<iso3>-dis-` from the target language.
- `RuleSet::load` reads only a top-level `iso3` key of `meta.yaml`: it skips a BOM, a trailing comment and one pair of quotes, and refuses `iso3:xxa`. The CLI stops with a stated error, exit 1, when a store holds no readable `iso3`.
- SPEC §3.4 gains the `Lang` definition, and `docs/standards/testing.md` loses its skip sentence.
- The comment at `engine.hpp:22` says every public enum has an 8-bit base. It changes to name `Lang` as the one exception.
