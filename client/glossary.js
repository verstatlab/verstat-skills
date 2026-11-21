(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});
  var HIDE_MS = 180;
  var SKIP = 'pre, code, kbd, button, svg, script, style, textarea, input, select, .vs-chip, .vs-term, [data-no-terms]';
  var pattern = null;
  var lookup = {};
  var hideTimer = null;
  var current = null;

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function build() {
    var entries = vs.page.glossary || [];
    var forms = [];
    entries.forEach(function (entry, i) {
      [entry.term, entry.code].concat(entry.aliases || []).forEach(function (form) {
        if (typeof form !== 'string' || !form.trim()) return;
        var key = form.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(lookup, key)) return;
        lookup[key] = i;
        forms.push(form);
      });
    });
    if (!forms.length) return null;
    forms.sort(function (a, b) { return b.length - a.length; });
    return new RegExp('(?<![\\p{L}\\p{N}_])(' + forms.map(escapeRe).join('|') + ')(?![\\p{L}\\p{N}_])', 'giu');
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      document.getElementById('vs-term').hidden = true;
      current = null;
    }, HIDE_MS);
  }

  function place(pop, target) {
    var rect = target.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    pop.style.left = '0px';
    pop.style.top = '0px';
    var w = Math.min(340, vw - 24);
    var h = pop.offsetHeight;
    var x = Math.max(12, Math.min(rect.left, vw - w - 12));
    var y = rect.bottom + 6;
    if (y + h > vh - 8 && rect.top - h - 6 >= 8) y = rect.top - h - 6;
    else if (y + h > vh - 8) y = Math.max(8, vh - h - 8);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }

  function show(node) {
    clearTimeout(hideTimer);
    if (current === node) return;
    var entry = (vs.page.glossary || [])[Number(node.getAttribute('data-term'))];
    if (!entry) return;
    var pop = document.getElementById('vs-term');
    pop.replaceChildren(
      vs.el('div', { class: 'vs-term-head' }, [
        vs.el('span', { class: 'vs-term-name' }, entry.term),
        entry.code ? vs.el('span', { class: 'vs-mono vs-muted', style: 'font-size:12px' }, entry.code) : null,
        entry.source ? vs.sourceChip(entry.source) : null,
      ]),
      vs.el('span', { class: 'vs-term-def' }, entry.definition),
      entry.anchor ? vs.el('div', {}, vs.anchors.chip(entry.anchor)) : null,
    );
    pop.hidden = false;
    current = node;
    place(pop, node);
  }

  function skipped(node) {
    var parent = node.parentElement;
    return !parent || !!parent.closest(SKIP);
  }

  function highlight(root) {
    if (!pattern || !root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim() || skipped(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (textNode) {
      var text = textNode.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) return;
      pattern.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var last = 0;
      var m;
      while ((m = pattern.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var span = vs.el('span', {
          class: 'vs-term',
          tabindex: '0',
          'data-term': lookup[m[1].toLowerCase()],
        }, m[1]);
        frag.appendChild(span);
        last = m.index + m[1].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  vs.glossary = {
    init: function () {
      pattern = build();
      var pop = document.getElementById('vs-term');
      pop.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
      pop.addEventListener('mouseleave', scheduleHide);
      var main = document.getElementById('vs-main-col');
      main.addEventListener('mouseover', function (e) {
        var t = e.target.closest && e.target.closest('.vs-term');
        if (t) show(t);
      });
      main.addEventListener('mouseout', function (e) {
        var t = e.target.closest && e.target.closest('.vs-term');
        if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) scheduleHide();
      });
      main.addEventListener('focusin', function (e) {
        if (e.target.classList && e.target.classList.contains('vs-term')) show(e.target);
      });
      main.addEventListener('focusout', function (e) {
        if (e.target.classList && e.target.classList.contains('vs-term')) scheduleHide();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          pop.hidden = true;
          current = null;
        }
      });
      window.addEventListener('scroll', function () {
        if (current) {
          pop.hidden = true;
          current = null;
        }
      }, { passive: true });
    },
    highlight: highlight,
  };
})();
