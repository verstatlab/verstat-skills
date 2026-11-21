(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});

  var keys = [];
  var marks = null;
  var widgets = [];
  var boxes = [];

  function storageKey() {
    var page = vs.page || {};
    var repos = page.repos || {};
    var id = (page.question || '') + '|' + Object.keys(repos).sort().map(function (n) { return n + '@' + (repos[n] && repos[n].sha); }).join(',');
    var h = 5381;
    for (var i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
    return 'verstat.read.' + h.toString(36);
  }

  function load() {
    if (marks) return marks;
    marks = {};
    try {
      var stored = JSON.parse(window.localStorage.getItem(storageKey()) || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) marks = stored;
    } catch (err) {
      marks = {};
    }
    return marks;
  }

  function save() {
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(marks));
    } catch (err) {
      return;
    }
  }

  function count() {
    load();
    return keys.filter(function (k) { return marks[k]; }).length;
  }

  function label() {
    var n = keys.length;
    return vs.plural(n, 'read.progress', { read: count() });
  }

  function paint() {
    widgets = widgets.filter(function (w) { return w.node.isConnected || !w.placed; });
    widgets.forEach(function (w) {
      var none = count() === 0;
      w.text.textContent = label();
      w.reset.setAttribute('aria-hidden', none ? 'true' : 'false');
      w.reset.tabIndex = none ? -1 : 0;
    });
    boxes = boxes.filter(function (b) { return b.node.isConnected || !b.placed; });
    boxes.forEach(function (b) {
      var on = has(b.key);
      b.node.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.node.title = vs.t(on ? 'read.markUnread' : 'read.markRead');
      b.node.setAttribute('aria-label', b.node.title);
      if (b.onChange) b.onChange(on);
    });
  }

  function has(key) {
    return !!load()[key];
  }

  function key(repo, path) {
    return repo + '/' + path;
  }

  function register(k) {
    if (keys.indexOf(k) < 0) keys.push(k);
  }

  function toggle(k) {
    load();
    if (marks[k]) delete marks[k];
    else marks[k] = true;
    save();
    paint();
  }

  function reset() {
    marks = {};
    save();
    paint();
  }

  function box(k, onChange) {
    register(k);
    var node = vs.el('button', { type: 'button', class: 'vs-read-box', 'data-own-click': true, onclick: function (e) { e.stopPropagation(); toggle(k); } },
      vs.el('span', {}, vs.svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, vs.svg('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }))));
    var entry = { key: k, node: node, onChange: onChange, placed: false };
    boxes.push(entry);
    setTimeout(function () { entry.placed = true; });
    paint();
    return node;
  }

  function widget() {
    if (!keys.length) return null;
    var text = vs.el('span', {});
    var resetButton = vs.el('button', { type: 'button', class: 'vs-read-reset', onclick: reset }, vs.t('read.reset'));
    var node = vs.el('span', { class: 'vs-read' }, [text, resetButton]);
    var entry = { node: node, text: text, reset: resetButton, placed: false };
    widgets.push(entry);
    setTimeout(function () { entry.placed = true; });
    paint();
    return node;
  }

  function mount() {
    if (!keys.length) return;
    var root = document.getElementById('verstat-root');
    if (!root) return;
    var stats = root.querySelector('.vs-brief-stats');
    if (stats) {
      stats.appendChild(widget());
      return;
    }
    var title = root.querySelector('h1');
    if (title) title.insertAdjacentElement('afterend', vs.el('div', { class: 'vs-read-line' }, widget()));
  }

  vs.read = { key: key, register: register, has: has, toggle: toggle, reset: reset, count: count, total: function () { return keys.length; }, box: box, widget: widget };
  if (vs.on) vs.on('ready', mount);
})();
