/* SPDX-License-Identifier: MPL-2.0
 * Verstaan console — page behaviour. Reads the inline JSON island and builds the DOM with
 * textContent only. No fetch(), no module import: it must run from file:// with a null origin.
 * Data from the island is data. It is never inserted as HTML. */
(function () {
  'use strict';

  var GLYPH = {
    done: { g: '●', label: 'won' },
    'in-progress': { g: '◐', label: 'fighting' },
    next: { g: '◐', label: 'next' },
    open: { g: '○', label: 'open' },
    blocked: { g: '◇', label: 'blocked' }
  };

  function island() {
    var node = document.getElementById('console-data');
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (e) { return null; }
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }
  function set(id, text) { var n = document.getElementById(id); if (n) n.textContent = text; }

  function state(issue, m) {
    if (issue.status === 'done') return 'done';
    if (issue.status === 'in-progress') return 'in-progress';
    if (m.next && m.next.n === issue.n) return 'next';
    var done = {};
    m.issues.forEach(function (i) { if (i.status === 'done') done[i.n] = true; });
    for (var k = 0; k < issue.dependsOn.length; k++) if (!done[issue.dependsOn[k]]) return 'blocked';
    return 'open';
  }

  function encounter(issue, m) {
    var s = state(issue, m);
    var row = el('div', 'enc enc--' + s);
    row.appendChild(el('span', 'enc__glyph', GLYPH[s].g));
    row.appendChild(el('span', 'enc__n mono', '#' + pad(issue.n)));
    var t = el('span', 'enc__title'); var a = el('a', null, issue.title); a.href = 'quests.html#issue-' + pad(issue.n); t.appendChild(a); row.appendChild(t);
    var meta = GLYPH[s].label;
    if (issue.worktree) meta += ' · in ' + issue.worktree;
    if (issue.agent) meta += ' · ' + issue.agent + (issue.model ? ' / ' + issue.model : '');
    if (issue.checkpoint != null) meta += ' · checkpoint ' + issue.checkpoint;
    if (s === 'done' && issue.commit) meta += ' · ' + issue.commit;
    row.appendChild(el('span', 'enc__meta', meta));
    row.setAttribute('aria-label', '#' + pad(issue.n) + ' ' + issue.title + ', ' + GLYPH[s].label);
    return row;
  }

  function quest(ms, m, isMain) {
    var q = el('section', 'quest' + (isMain ? ' quest--main' : ''));
    var head = el('div', 'quest__head');
    head.appendChild(el('span', 'quest__name', (isMain ? 'Main quest · ' : '') + ms.name));
    head.appendChild(el('span', 'quest__count', ms.won + ' of ' + ms.total + ' encounters won'));
    q.appendChild(head);
    var bar = el('div', 'quest__bar'); var fill = el('i');
    fill.style.width = (ms.total ? Math.round(100 * ms.won / ms.total) : 0) + '%';
    bar.appendChild(fill); bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', ms.won + ' of ' + ms.total + ' won');
    q.appendChild(bar);
    ms.issues.forEach(function (i) { q.appendChild(encounter(i, m)); });
    return q;
  }

  function tree(t) {
    var r = el('div', 'tree' + (t.isRoot ? ' tree--root' : '') + (t.merged ? ' tree--merged' : ''));
    r.appendChild(el('span', 'tree__path mono', t.path + (t.isRoot ? ' (root)' : '')));
    r.appendChild(el('span', 'tree__branch mono', t.branch || 'detached'));
    r.appendChild(el('span', 'tree__dirty' + (t.dirty ? ' tree__dirty--warn' : ''), t.dirty ? t.dirty + ' dirty' : 'clean'));
    r.appendChild(el('span', 'tree__stamp' + (t.stampMatches ? ' tree__stamp--ok' : ''), t.stampMatches ? 'stamped' : 'no stamp'));
    r.appendChild(el('span', 'tree__merged' + (t.merged ? ' tree__merged--yes' : ''), t.merged ? 'merged' : ''));
    // A merged tree's branch is done work, even if a stale issue file still names it in-progress
    // (the file has not been removed yet). Never show it as the active tree for an issue.
    r.appendChild(el('span', 'tree__issue', !t.merged && t.issue ? '#' + pad(t.issue.n) + ' ' + t.issue.title : '—'));
    return r;
  }

  function tile(title, metric, blurb, cls) {
    var t = el('div', 'tile');
    t.appendChild(el('span', 'tile__corner'));
    t.appendChild(el('h3', 'tile__title', title));
    t.appendChild(el('span', 'tile__metric mono' + (cls ? ' ' + cls : ''), metric));
    t.appendChild(el('p', 'tile__blurb', blurb));
    return t;
  }

  var CONTAINERS = ['tiles', 'map-body', 'side-body', 'trees-body', 'party-body', 'ledger-body'];
  function clear() {
    CONTAINERS.forEach(function (id) { var n = document.getElementById(id); if (n) while (n.firstChild) n.removeChild(n.firstChild); });
  }

  function render(m) {
    clear();
    var mq = m.mainQuest;
    set('band', 'Milestone ' + (mq ? mq.name : 'none') + ' · branch ' + m.git.branch);
    set('headline', mq ? 'Main quest: ' + mq.name : 'No open quest');
    set('lede', m.totals.done + ' of ' + m.totals.issues + ' encounters won across the map. ' +
      (m.last ? 'Last won: #' + pad(m.last.n) + ' ' + m.last.title + '. ' : 'Nothing won yet. ') +
      (m.next ? 'Next: #' + pad(m.next.n) + ' ' + m.next.title + '.' : 'Nothing is unblocked.'));

    if (m.next) {
      set('rail-cmd', m.next.command);
      var rl = document.getElementById('rail-link'); if (rl) rl.href = 'quests.html#issue-' + pad(m.next.n);
      set('rail-text', '#' + pad(m.next.n) + ' ' + m.next.title + '. ' + (m.next.agent ? m.next.agent + ' takes it at ' + m.next.model + ', ' + m.next.effort + ' effort.' : ''));
    } else {
      set('rail-cmd', '');
      set('rail-text', 'Every open issue is blocked or every issue is done. Write the next milestone from PLAN.md §7.');
    }
    set('side-cmd', m.sideTask.command || '');
    set('side-text', m.sideTask.text);

    var tiles = document.getElementById('tiles');
    tiles.appendChild(tile('Save point', m.git.head, m.git.dirty ? m.git.dirty + ' uncommitted file' + (m.git.dirty === 1 ? '' : 's') + ' on ' + m.git.branch : 'clean tree on ' + m.git.branch, m.git.dirty ? 'tile__metric--warn' : ''));
    tiles.appendChild(tile('Gate stamp', m.stamp.matches ? 'HEAD' : (m.stamp.present ? 'stale' : 'none'), m.stamp.matches ? 'The full gate passed on this commit. A merge is allowed.' : 'No gate has passed on HEAD. /gate before any merge.', m.stamp.matches ? '' : 'tile__metric--warn'));
    tiles.appendChild(tile('Side quests', String(m.sideQuests.length), m.sideQuests.length ? 'open and unblocked' : 'none open', m.sideQuests.length ? 'tile__metric--live' : ''));
    tiles.appendChild(tile('Ledger', String(m.lessons.total), m.lessons.ripe.length ? m.lessons.ripe.length + ' signature' + (m.lessons.ripe.length === 1 ? '' : 's') + ' ripe for the retro' : 'no signature at three yet', m.lessons.ripe.length ? 'tile__metric--warn' : ''));
    tiles.appendChild(tile('Remote', m.git.remote === 'no remote' ? 'local' : 'set', m.git.remote === 'no remote' ? 'No remote yet. Merges happen locally after /gate.' : m.git.remote));

    var map = document.getElementById('map-body');
    if (!m.milestones.length) map.appendChild(el('p', 'empty', 'No issue files under docs/factory/issues/.'));
    m.milestones.forEach(function (ms) { map.appendChild(quest(ms, m, mq && ms.name === mq.name)); });

    var side = document.getElementById('side-body');
    if (!m.sideQuests.length) side.appendChild(el('p', 'empty', 'None open.'));
    m.sideQuests.forEach(function (i) { side.appendChild(encounter(i, m)); });

    var trees = document.getElementById('trees-body');
    if (trees) {
      var wts = m.worktrees || [];
      if (!wts.length) trees.appendChild(el('p', 'empty', 'No worktrees. Run `git worktree list` to check.'));
      wts.forEach(function (t) { trees.appendChild(tree(t)); });
    }

    var party = document.getElementById('party-body');
    m.party.forEach(function (p) {
      var r = el('div', 'party__row');
      var pn = el('span', 'party__name'); var pa = el('a', null, p.name); pa.href = 'docs/.claude--agents--' + p.name + '.html'; pn.appendChild(pa); r.appendChild(pn);
      var cost = el('span', 'party__cost'); cost.appendChild(el('b', null, p.model)); r.appendChild(cost);
      var eff = el('span', 'party__cost'); eff.appendChild(el('b', null, p.effort)); r.appendChild(eff);
      r.appendChild(el('span', 'party__role', p.role));
      party.appendChild(r);
    });

    var ledger = document.getElementById('ledger-body');
    var xp = el('div', 'xp');
    var bar = el('div', 'xp__bar'); var fill = el('i');
    var top = m.lessons.bySig.length ? m.lessons.bySig[0].count : 0;
    fill.style.width = Math.min(100, Math.round(100 * top / 3)) + '%';
    bar.appendChild(fill); xp.appendChild(bar);
    xp.appendChild(el('span', 'xp__num', top + ' of 3 to the next rule'));
    ledger.appendChild(xp);
    if (!m.lessons.bySig.length) ledger.appendChild(el('p', 'empty', 'The ledger is empty. The fast gate writes here when it fails.'));
    m.lessons.bySig.forEach(function (s) {
      var r = el('div', 'sig');
      r.appendChild(el('span', 'sig__name mono', s.sig));
      r.appendChild(el('span', 'sig__count' + (s.count >= 3 ? ' sig__count--ripe' : ''), s.count + (s.count >= 3 ? ' · ripe' : '')));
      r.appendChild(el('span', 'sig__last', s.last));
      ledger.appendChild(r);
    });

    set('foot', 'Rendered ' + m.generated + ' from docs/factory/issues, .claude/agents, lessons.jsonl and git. Regenerate with node tools/console/src/generate.mjs. Nothing here is editable; the files are.');
  }

  /* Exposed for a future in-place caller; nothing calls update(model) today. The service that
   * once did (serve.mjs + live.js) is gone (issue 99): live updates now come from apps/console,
   * a separate Node/React app that does not use this file at all. */
  window.verstaanConsole = { update: render };

  var m = island();
  if (m) render(m); else set('lede', 'The data island did not parse. Regenerate the page.');
})();
