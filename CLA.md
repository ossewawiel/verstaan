# Contributor licence agreement

Verstaan uses a contributor licence agreement (CLA) so the project can relicense later if it must,
without tracking down every contributor. The engine is MPL-2.0 today and the data CC BY-SA 4.0;
the CLA does not change what you receive, only what the project may do with what you give.

The agreement text is the Apache Software Foundation individual CLA, used unchanged:
https://www.apache.org/licenses/icla.pdf

Read "the Foundation" as "the Verstaan project, represented by Marsel Pretorius".

To sign: open a pull request that adds one line to `CONTRIBUTORS.md` in the form

```
Full Name <email> — signed ICLA on YYYY-MM-DD
```

The line is the record. A CLA check on pull requests (`.github/workflows/gate.yml`, the `cla`
job) looks for it on every pull request except the owner's own.

Language data you contribute is licensed CC BY-SA 4.0. If it derives from the UNL Archive, keep
the archive attribution in `data/archive/manifest.jsonl`.
