---
issue: 211
title: "The validator refuses a store the engine's reader cannot read"
milestone: Side
status: open
depends_on: []
agent: implementer
agents: [implementer]
model: sonnet
effort: medium
checkpoint: 4
commit: null
worktree: null
github_issue: 337
---
## What

The C++ reader is not a YAML parser. It expects eight fixed lines per dictionary entry
(`engine/src/dictionary_lookup.cpp:266`) and seven per rule (`rule_interpreter.cpp:117`). It
handles only double quotes (`dictionary_lookup.cpp:119-125`, `rule_interpreter.cpp:99-105`) and only
one-line flow maps (`dictionary_lookup.cpp:317`). `tools/validate` reads real YAML.
`split_inflection_branches` emits a branch only at a `;` (`rule_interpreter.cpp:771-786`), so a last
branch with no `;` is lost.

Quest 29 reads the store in Python. A rule-author saves one rule with single quotes, which is
valid YAML. The compiled back end fires it, the runtime back end retires it, and the equivalence
suite fails on a file the validator passed. The verifier ran `validate_store` on a small copy of
each variant (F6). Each copy also gets one artefact error, `iso3 'eng' is not the store folder`,
from its scratch folder name.

```
variant                                validator                 engine
dictionary: features in block form     passes                    a book   exit=0  boek
dictionary: headword 'book' in ''      passes                    a book   exit=2  ⟦book⟧
afr-gen-35: lhs in single quotes       passes                    the book exit=0  boek  (afr-gen-35 unsupported)
M3: no trailing ;                      passes                    books    exit=0  boek
afr-gen-34: comment line removed       error, comment required   the book exit=0  boek  (rule 35 gone, no trace)
dictionary: priority line removed      error, priority required  box      exit=2  ⟦box⟧ (next entry swallowed)
```

No shipped data hits this today: a real shard parsed clean on every field count, eng 576,885 and
afr 30,844, with no single-quoted scalar anywhere. F10.4 adds that nobody chose the fixed-line
reader. ADR 0020 records it as a fact.

After this quest, one short ADR records the store's on-disk format as the fixed-line shape the
importer writes. The validator refuses each variant above with an error, and handles a last branch with no `;`
or refuses it. The checkpoint is 4 because this is a decision.

## Acceptance criteria

- Each row of the table above gets a validator error, in a pytest. A pytest cannot run the C++
  engine, so no row passes by matching behaviour.
- `--all` has not been run on this branch. The implementer runs it once before relying on it.
- A last inflection branch with no `;` is handled or refused, in a pytest.
- The ADR is accepted.
- `python -m tools.validate --all` still exits 0 on the real stores.
- `ctest --preset linux-gcc -L fast` passes.
- `python -m tools.validate --changed` exits 0.

## Not in scope

Replacing the fixed-line reader with a YAML parser. Reporting a load failure: quest 210.

## Done when

- [ ] Every row of F6's table gets a validator error, in a pytest.
- [ ] The ADR is accepted.
- [ ] `validate --all` exits 0 on real stores.
- [ ] `ctest --preset linux-gcc -L fast` and `python -m tools.validate --changed` are green.
