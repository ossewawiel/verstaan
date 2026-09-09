// SPDX-License-Identifier: MPL-2.0
// node tools/console/src/generate.mjs  →  docs/factory/console/{index,quests,playbook,library,glossary}.html + docs/*.html
import { writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readRepo, REPO } from './read.mjs';
import { buildModel } from './parse.mjs';
import { renderConsole, renderQuests, renderLibrary, renderDoc, renderRoomFromDoc, docHref } from './render.mjs';
import { runChain } from './chain.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(REPO, 'docs', 'factory', 'console');
mkdirSync(out, { recursive: true });
if (existsSync(join(out, 'docs'))) rmSync(join(out, 'docs'), { recursive: true });
mkdirSync(join(out, 'docs'), { recursive: true });

const repo = readRepo();
const model = buildModel(repo);
const allDocs = repo.library.flatMap((g) => g.docs);
const known = new Set(allDocs.map((d) => d.path));
const find = (p) => allDocs.find((d) => d.path === p);

writeFileSync(join(out, 'index.html'), renderConsole(model), 'utf8');
writeFileSync(join(out, 'quests.html'), renderQuests(model, repo.issueFiles, known), 'utf8');
writeFileSync(join(out, 'library.html'), renderLibrary(model, repo.library, repo.artefacts), 'utf8');

const playbook = find('docs/factory/playbook.md');
if (playbook) writeFileSync(join(out, 'playbook.html'), renderRoomFromDoc('playbook', playbook, model, known, { band: 'Playbook · how the game is played', lede: 'The moving parts as a player meets them: the map, an encounter, the gates, the checkpoints, and how the factory levels up.' }), 'utf8');
const glossary = find('docs/glossary.md');
if (glossary) writeFileSync(join(out, 'glossary.html'), renderRoomFromDoc('glossary', glossary, model, known, { band: 'Glossary · the domain language', lede: 'One term, one meaning, for code, data, issues, chat and this console. Add a term to docs/glossary.md rather than inventing a synonym.' }), 'utf8');

let n = 0;
for (const d of allDocs) {
  writeFileSync(join(out, docHref(d.path)), renderDoc(d, model, known), 'utf8');
  n += 1;
}

for (const f of ['theme.css', 'console.css', 'console.js']) copyFileSync(resolve(here, '..', 'theme', f), join(out, f));

const next = model.next ? `#${String(model.next.n).padStart(2, '0')} ${model.next.title}` : 'none';
console.log(`console: wrote ${out} (5 rooms, ${n} library pages)`);
console.log(`console: ${model.totals.done}/${model.totals.issues} encounters won · next ${next} · side task: ${model.sideTask.kind}`);

// The root tree's console is the one the owner keeps open. Work happens in .worktrees/<branch>,
// and every trigger there (edit hook, stop hook, git hook) runs this file from that tree. So when
// this tree is not the root, also regenerate the root's console with the root's own generator,
// which reads the issue files across every tree (read.mjs, mergeIssuesAcrossWorktrees). One hop
// only: the env flag stops the root run from chaining back.
runChain(REPO, sh('git rev-parse --path-format=absolute --git-common-dir'), !!process.env.VERSTAAN_CONSOLE_NO_CHAIN);

function sh(cmd) {
  try { return execSync(cmd, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}
