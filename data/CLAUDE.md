# data/

Language data. CC BY-SA 4.0, see `LICENSE` in this folder. Rules: `docs/standards/data.md`.

- `archive/` is the verbatim mirror of unlarchive.org plus `manifest.jsonl`. Written by
  `tools.mirror` only. Never edit. Never reinterpret here.
- `languages/<iso3>/` is the canonical store, layout in `docs/factory/SPEC.md` §3.3. Written by
  `tools.importer` and by rule work. Every record keeps `source`.
- Every store file starts with the licence header from `SPEC.md` §4.
- A grammar change needs a test sentence in `languages/<iso3>/tests/`.
- Nothing personal lives here: no user profiles, no e-mail addresses, no credentials.
