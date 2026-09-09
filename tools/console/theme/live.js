/* SPDX-License-Identifier: MPL-2.0
 * Verstaan console — live updates without a reload. Served by serve.mjs at /live.js; the file
 * console (file://) never loads it. On a change event from /events the page fetches its own URL
 * again and swaps the content in place: the command console re-renders from the new data island
 * through window.verstaanConsole.update, every other room swaps its <main>. Open cards, scroll
 * position and focus survive, and nothing flickers. A fetch that fails is ignored; the next
 * event tries again. */
(function () {
  'use strict';

  function withState(fn) {
    var open = [];
    var details = document.querySelectorAll('details[open]');
    for (var i = 0; i < details.length; i++) if (details[i].id) open.push(details[i].id);
    var x = window.scrollX, y = window.scrollY;
    var active = document.activeElement && document.activeElement.id;
    fn();
    for (var j = 0; j < open.length; j++) { var d = document.getElementById(open[j]); if (d) d.open = true; }
    window.scrollTo(x, y);
    if (active) { var a = document.getElementById(active); if (a && a.focus) a.focus(); }
    mark();
  }

  function mark() {
    var sub = document.querySelector('.cic-bar__sub');
    if (!sub) return;
    sub.setAttribute('data-updated', new Date().toLocaleTimeString());
    sub.classList.add('cic-bar__sub--pulse');
    setTimeout(function () { sub.classList.remove('cic-bar__sub--pulse'); }, 1200);
  }

  function apply(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var island = doc.getElementById('console-data');
    if (island && window.verstaanConsole) {
      var model;
      try { model = JSON.parse(island.textContent); } catch (e) { return; }
      var mine = document.getElementById('console-data');
      if (mine) mine.textContent = island.textContent;
      withState(function () { window.verstaanConsole.update(model); });
      return;
    }
    var next = doc.querySelector('main');
    var cur = document.querySelector('main');
    if (!next || !cur) return;
    withState(function () { cur.replaceWith(document.adoptNode(next)); });
  }

  function refresh() {
    fetch(location.pathname + location.search, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
      .then(apply)
      .catch(function () { /* the next event tries again */ });
  }

  function connect() {
    try {
      var s = new EventSource('/events');
      s.onmessage = function (e) { if (e.data === 'reload') refresh(); };
    } catch (e) { /* no live updates; the page still works */ }
  }

  window.verstaanLive = { refresh: refresh, apply: apply };
  connect();
})();
