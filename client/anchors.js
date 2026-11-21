(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});
  var HOST_MAX_HEIGHT = 260;
  var drawerOpener = null;
  var armed = null;

  function fileOf(anchor) {
    return anchor && vs.page.code && vs.page.code[anchor.repo + ':' + anchor.path];
  }

  function spansOf(anchor) {
    if (!anchor || !anchor.line) return [];
    return anchor.spans || [[anchor.line, anchor.endLine || anchor.line]];
  }

  function spanText(spans, dash, sep) {
    return spans.map(function (s) { return s[1] > s[0] ? s[0] + dash + s[1] : String(s[0]); }).join(sep);
  }

  function lineLabel(anchor) {
    return spanText(spansOf(anchor), '–', ', ');
  }

  function where(anchor) {
    var spans = spansOf(anchor);
    if (!spans.length) return vs.t('anchors.file');
    return vs.t(spans.length > 1 || spans[0][1] > spans[0][0] ? 'anchors.lines' : 'anchors.line', { lines: lineLabel(anchor) });
  }

  function copyText(anchor) {
    var spans = spansOf(anchor);
    return anchor.repo + '/' + anchor.path + (spans.length ? ':' + spanText(spans, '-', ',') : '');
  }

  function shaOf(anchor) {
    var file = fileOf(anchor);
    var repo = vs.page.repos && vs.page.repos[anchor.repo];
    return vs.shortSha((file && file.sha) || (repo && repo.sha));
  }

  function isHit(spans, n) {
    for (var i = 0; i < spans.length; i++) if (n >= spans[i][0] && n <= spans[i][1]) return true;
    return false;
  }

  function wholeFile(anchor) {
    var file = fileOf(anchor);
    var box = vs.el('div', { class: 'vs-code' });
    if (!file || !file.lines) {
      box.appendChild(vs.el('div', { class: 'vs-code-gap' }, vs.t('anchors.notEmbedded')));
      return box;
    }
    var spans = spansOf(anchor);
    var colored = vs.syntax.highlight(file.lines, anchor.path);
    colored.forEach(function (nodes, i) {
      var n = i + 1;
      box.appendChild(vs.el('div', { class: 'vs-code-line' + (isHit(spans, n) ? ' vs-hit' : ''), 'data-ln': String(n) }, [
        vs.el('span', { class: 'vs-code-num' }, String(n)),
        vs.el('span', { class: 'vs-code-text' }, nodes.length ? nodes : ' '),
      ]));
    });
    return box;
  }

  function closeDrawer() {
    var drawer = document.getElementById('vs-drawer');
    if (drawer.hidden) return;
    drawer.hidden = true;
    drawer.replaceChildren();
    if (drawerOpener && document.body.contains(drawerOpener)) drawerOpener.focus();
    drawerOpener = null;
  }

  function openDrawer(anchor, opener) {
    var term = document.getElementById('vs-term');
    if (term) term.hidden = true;
    var drawer = document.getElementById('vs-drawer');
    var close = vs.el('button', { type: 'button', class: 'vs-iconbtn', title: vs.t('anchors.close'), 'aria-label': vs.t('anchors.close'), onclick: closeDrawer }, vs.icon('x', 15));
    var copy = vs.el('button', {
      type: 'button',
      class: 'vs-iconbtn',
      title: vs.t('anchors.copyPath'),
      'aria-label': vs.t('anchors.copyPath'),
      onclick: function () { vs.copy(copyText(anchor), vs.t('anchors.pathCopied')); },
    }, vs.icon('copy', 15));
    var body = vs.el('div', { class: 'vs-drawer-body' }, wholeFile(anchor));
    drawer.replaceChildren(
      vs.el('div', { class: 'vs-backdrop', onclick: closeDrawer }),
      vs.el('aside', { class: 'vs-drawer-panel', role: 'dialog', 'aria-label': anchor.path }, [
        vs.el('div', { class: 'vs-drawer-head' }, [
          vs.el('div', { class: 'vs-drawer-title' }, [
            vs.el('span', { class: 'vs-drawer-path' }, anchor.path),
            vs.el('span', { class: 'vs-drawer-meta' }, anchor.repo + '@' + shaOf(anchor) + ' · ' + where(anchor)),
          ]),
          copy,
          close,
        ]),
        body,
      ]),
    );
    drawerOpener = opener || null;
    drawer.hidden = false;
    close.focus();
    var hit = body.querySelector('.vs-hit');
    body.scrollTop = hit ? Math.max(0, hit.offsetTop - 120) : 0;
  }

  function chip(anchor, label) {
    if (!anchor) return null;
    var spans = spansOf(anchor);
    var name = anchor.path.split('/').pop();
    var text = label || (spans.length ? name + ':' + lineLabel(anchor) : name);
    var node = vs.el('button', { type: 'button', class: 'vs-chip vs-anchor' }, text);
    node.addEventListener('click', function (e) {
      e.stopPropagation();
      openDrawer(anchor, node);
    });
    return node;
  }

  function hostOf(target) {
    if (!target || !target.closest || target.closest('aside, #vs-bar, #vs-strip, #vs-term, #vs-drawer')) return null;
    var pill = target.closest('.vs-anchor');
    if (!pill && target.closest('button, a, input, select, textarea, label, summary, [contenteditable], [role="button"], [tabindex], [data-own-click]')) return null;
    var node = pill || target;
    var host = null;
    while (node && node !== document.body && node.tagName !== 'SECTION') {
      if (node.getBoundingClientRect().height > HOST_MAX_HEIGHT) break;
      var count = node.querySelectorAll('.vs-anchor').length + (node.matches('.vs-anchor') ? 1 : 0);
      if (count > 1) break;
      if (count === 1) host = node;
      node = node.parentElement;
    }
    return host ? { host: host, pill: pill || host.querySelector('.vs-anchor') } : null;
  }

  function arm(found) {
    var pill = found && found.pill;
    if (armed === pill) return;
    if (armed) {
      armed.classList.remove('vs-armed');
      var oldHost = armed.closest('.vs-anchor-host');
      if (oldHost) oldHost.classList.remove('vs-anchor-host');
    }
    armed = pill || null;
    if (armed) {
      armed.classList.add('vs-armed');
      if (found.host !== armed) found.host.classList.add('vs-anchor-host');
    }
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || (e.target.closest && e.target.closest('.vs-anchor'))) return;
    var found = hostOf(e.target);
    if (!found) return;
    var selection = window.getSelection && String(window.getSelection());
    if (selection) return;
    found.pill.click();
  }

  vs.anchors = {
    chip: chip,
    open: openDrawer,
    close: closeDrawer,
    init: function () {
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDrawer();
      });
      document.addEventListener('click', onClick);
      var hovered = null;
      document.addEventListener('mouseover', function (e) {
        if (e.target === hovered) return;
        hovered = e.target;
        arm(hostOf(e.target));
      });
      document.addEventListener('mouseout', function (e) {
        if (e.relatedTarget) return;
        hovered = null;
        arm(null);
      });
    },
  };
})();
