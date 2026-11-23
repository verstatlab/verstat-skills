(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var THEME_KEY = 'verstat.theme';

  var page = JSON.parse(document.getElementById('verstat-page').textContent);
  var renders = {};
  var listeners = {};
  vs.page = page;
  vs.blocks = [];

  function append(node, children) {
    [].concat(children === undefined || children === null ? [] : children).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function setAttrs(node, attrs) {
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    });
    return node;
  }

  function el(tag, attrs, children) {
    return append(setAttrs(document.createElement(tag), attrs), children);
  }

  function svg(tag, attrs, children) {
    return append(setAttrs(document.createElementNS(SVG_NS, tag), attrs), children);
  }

  var ICONS = {
    moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
    sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8Z', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
    check: ['M20 6 9 17l-5-5'],
    copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    chevronDown: ['m6 9 6 6 6-6'],
    chevronRight: ['m9 18 6-6-6-6'],
  };

  function icon(name, size) {
    var s = size || 16;
    return svg('svg', { viewBox: '0 0 24 24', width: s, height: s, class: 'vs-icon', 'aria-hidden': 'true' },
      ICONS[name].map(function (d) { return svg('path', { d: d }); }));
  }

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }

  function off(event, fn) {
    var list = listeners[event];
    if (!list) return;
    var at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  }

  function emit(event, detail) {
    (listeners[event] || []).slice().forEach(function (fn) {
      try {
        fn(detail);
      } catch (err) {
        console.error('verstat: a "' + event + '" listener failed', err);
      }
    });
  }

  function ownRepos() {
    return Object.keys(page.repos || {}).filter(function (name) { return name.indexOf('@') < 0; });
  }

  function shortSha(sha) {
    return String(sha || '').slice(0, 7);
  }

  function joinNames(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' ' + vs.t('core.and') + ' ' + names[names.length - 1];
  }

  var toastTimer = null;
  function toast(text, ms) {
    var node = document.getElementById('vs-toast');
    node.textContent = text;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, ms || 1800);
  }

  function fallbackCopy(text) {
    var ta = el('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;opacity:0;' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  function copy(text, toastText) {
    var done = function () { toast(toastText || vs.t('core.copied')); };
    var failed = function () {
      if (fallbackCopy(text)) done();
      else toast(vs.t('core.copyFailed'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, failed);
    } else {
      failed();
    }
  }

  function storeTheme(theme) {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      return;
    }
  }

  function currentTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function themeButton() {
    var button = el('button', { type: 'button', class: 'vs-iconbtn', id: 'vs-theme' });
    function paint() {
      var dark = currentTheme() === 'dark';
      button.replaceChildren(icon(dark ? 'sun' : 'moon'));
      button.title = vs.t(dark ? 'core.themeLight' : 'core.themeDark');
      button.setAttribute('aria-label', button.title);
    }
    button.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      storeTheme(next);
      paint();
      emit('theme', { theme: next });
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var changed = function () {
        paint();
        emit('theme', { theme: currentTheme() });
      };
      if (mq.addEventListener) mq.addEventListener('change', changed);
      else if (mq.addListener) mq.addListener(changed);
    }
    paint();
    return button;
  }

  function logo(skill) {
    var squares = [[0, 0], [80, 0], [20, 20], [60, 20], [40, 40]];
    return el('div', { class: 'vs-logo' }, [
      svg('svg', { viewBox: '0 0 96 56', class: 'vs-logo-mark', 'aria-hidden': 'true' }, squares.map(function (p, i) {
        return svg('rect', { x: p[0], y: p[1], width: 16, height: 16, class: i === 4 ? 'vs-logo-v' : null });
      })),
      el('div', { class: 'vs-logo-text' }, [
        el('span', { class: 'vs-logo-lab' }, 'VERSTAT LAB'),
        el('span', { class: 'vs-logo-skill' }, skill),
      ]),
    ]);
  }

  function renderBar() {
    var bar = document.getElementById('vs-bar');
    var v = page.validation || { anchors: 0, inferred: 0 };
    append(bar, [
      logo(page.skill),
      el('div', { class: 'vs-bar-repos' }, ownRepos().map(function (name) {
        return el('span', {}, name + '@' + shortSha(page.repos[name].sha));
      })),
      el('div', { class: 'vs-spacer' }),
      el('div', { class: 'vs-validate', title: vs.t('core.validated') }, [
        icon('check', 14),
        el('span', {}, 'verstat validate · ' + vs.plural(v.anchors, 'core.anchors') + ' · ' + vs.plural(v.inferred, 'core.inferred')),
      ]),
      themeButton(),
    ]);
  }

  function renderFooter() {
    var repos = ownRepos();
    append(document.getElementById('vs-footer'), [
      el('span', {}, vs.t('core.footerQuestion', { skill: page.skill, question: page.question })),
      el('span', {}, repos.map(function (name) { return name + '@' + shortSha(page.repos[name].sha); })
        .concat(['verstat build ' + ((page.engine && page.engine.version) || 'unknown')]).join(' · ')),
      repos.length ? el('span', {}, vs.t('core.containsCode', { repos: joinNames(repos) })) : null,
    ]);
    document.title = page.question + ' · ' + page.skill;
  }

  function isEmpty(node) {
    if (node === null || node === undefined || node === false) return true;
    if (typeof DocumentFragment !== 'undefined' && node instanceof DocumentFragment) return node.childNodes.length === 0;
    return false;
  }

  function hasChange(value) {
    if (Array.isArray(value)) return value.some(hasChange);
    if (value && typeof value === 'object') {
      if (typeof value.change === 'string') return true;
      return Object.keys(value).some(function (k) { return hasChange(value[k]); });
    }
    return false;
  }

  function sourceChip(source) {
    if (!source) return null;
    var label = vs.t('core.source.' + source, null, source);
    return el('span', {
      class: 'vs-chip vs-source',
      'data-source': source,
      title: source === 'inferred' ? vs.t('core.inferredTitle') : vs.t('core.sourceTitle', { source: label }),
    }, label);
  }

  function makeEntry(block, index) {
    var meta = (renders[block.type] && renders[block.type].meta) || {};
    var entry = {
      block: block,
      index: index,
      number: String(index + 1).padStart(2, '0'),
      meta: meta,
      section: null,
      body: null,
      actions: null,
      focusHandlers: [],
      diffMode: meta.diffMode && hasChange(block) ? 'diff' : null,
      extraActions: [],
      offs: [],
    };
    return entry;
  }

  function makeDiff(mode) {
    if (!mode) {
      return {
        mode: null,
        shows: function () { return true; },
        value: function (part, field) { return part ? part[field] : undefined; },
        mark: function (node) { return node; },
      };
    }
    return {
      mode: mode,
      shows: function (part) {
        if (!part || !part.change) return true;
        if (mode === 'before') return part.change !== 'added';
        if (mode === 'after') return part.change !== 'removed';
        return true;
      },
      value: function (part, field) {
        if (!part) return undefined;
        if (mode === 'before' && part.change === 'changed' && part.before && Object.prototype.hasOwnProperty.call(part.before, field)) {
          return part.before[field];
        }
        return part[field];
      },
      mark: function (node, part) {
        if (mode === 'diff' && part && part.change && node && node.classList) node.classList.add('vs-' + part.change);
        return node;
      },
    };
  }

  function makeCtx(entry) {
    var ctx = {
      page: page,
      block: entry.block,
      number: entry.number,
      el: el,
      svg: svg,
      icon: icon,
      anchorChip: function (anchor, label) { return vs.anchors.chip(anchor, label); },
      sourceChip: sourceChip,
      t: vs.t,
      plural: vs.plural,
      isInferred: function (obj) { return !!(obj && obj.source === 'inferred'); },
      part: function (node, id) {
        if (node && id !== undefined && id !== null) node.setAttribute('data-part', id);
        return node;
      },
      action: function (label, onClick) {
        entry.extraActions.push({ label: label, onClick: onClick });
      },
      mermaid: function (fn) { vs.mermaid.attach(ctx, fn); },
      toast: toast,
      copy: copy,
      on: function (event, fn) {
        on(event, fn);
        entry.offs.push(function () { off(event, fn); });
      },
      emit: emit,
      onFocus: function (fn) { entry.focusHandlers.push(fn); },
      onCleanup: function (fn) { entry.offs.push(fn); },
      route: function () { return vs.route.state(); },
      goToStep: function (index) { vs.route.go(index); },
      diff: makeDiff(entry.diffMode),
      read: vs.read,
      pathLabels: vs.pathLabels,
      kicker: function (text) { entry.kicker = text; },
    };
    return ctx;
  }

  function runRender(entry) {
    var item = renders[entry.block.type];
    entry.extraActions = [];
    entry.focusHandlers = [];
    entry.kicker = null;
    entry.offs.splice(0).forEach(function (fn) { fn(); });
    var ctx = makeCtx(entry);
    if (!item) {
      return el('pre', { class: 'vs-fallback' }, JSON.stringify(entry.block, null, 2));
    }
    try {
      var out = item.render(entry.block, ctx);
      if (isEmpty(out)) return null;
      return out instanceof Node ? out : el('div', {}, String(out));
    } catch (err) {
      console.error('verstat: render of block "' + entry.block.id + '" failed', err);
      return el('pre', { class: 'vs-fallback' }, JSON.stringify(entry.block, null, 2));
    }
  }

  function buildActions(entry) {
    var actions = el('div', { class: 'vs-actions' });
    if (entry.diffMode) {
      var seg = el('div', { class: 'vs-seg', role: 'group', 'aria-label': vs.t('core.diffMode') });
      [['before', vs.t('core.before')], ['after', vs.t('core.after')], ['diff', vs.t('core.diff')]].forEach(function (m) {
        seg.appendChild(el('button', {
          type: 'button',
          'data-diff': m[0],
          'aria-pressed': entry.diffMode === m[0] ? 'true' : 'false',
          onclick: function () { vs.diff.setMode(entry, m[0]); },
        }, m[1]));
      });
      actions.appendChild(seg);
    }
    entry.extraActions.forEach(function (a) {
      actions.appendChild(el('button', { type: 'button', class: 'vs-action', onclick: a.onClick }, a.label));
    });
    if (entry.meta.frame !== 'bare') {
      entry.collapseButton = el('button', {
        type: 'button',
        class: 'vs-action vs-collapse',
        onclick: function () { vs.setCollapsed(entry, !entry.collapsed, true); },
      });
      actions.appendChild(entry.collapseButton);
    }
    return actions;
  }

  function frame(entry, body) {
    var block = entry.block;
    var meta = entry.meta;
    var bare = meta.frame === 'bare';
    var section = el('section', {
      class: 'vs-block' + (bare ? ' vs-bare' : ''),
      id: 'block-' + block.id,
      'data-block': block.id,
      'data-type': block.type,
    });
    entry.section = section;
    entry.actions = buildActions(entry);
    if (!bare) {
      var kicker = [entry.number];
      if (meta.group) kicker.push(vs.t('group.' + meta.group, null, meta.group));
      kicker.push(entry.kicker || vs.label(block.type, meta));
      var head = el('div', { class: 'vs-block-head' }, [el('span', { class: 'vs-kicker' }, kicker.join(' · ')), entry.actions]);
      append(section, [
        head,
        el('h2', {}, block.title || vs.label(block.type, meta)),
        block.subtitle ? el('p', { class: 'vs-sub' }, block.subtitle) : null,
      ]);
      entry.note = el('button', {
        type: 'button',
        class: 'vs-action',
        onclick: function () { vs.setCollapsed(entry, false, true); },
      }, vs.t('core.expand'));
      section.appendChild(el('div', { class: 'vs-collapsed-note' }, entry.note));
    } else if (entry.actions.childNodes.length) {
      section.appendChild(el('div', { class: 'vs-block-head' }, entry.actions));
    }
    entry.body = el('div', { class: 'vs-block-body' }, body);
    if (!bare) section.insertBefore(entry.body, section.lastChild);
    else section.appendChild(entry.body);
    return section;
  }

  vs.setCollapsed = function (entry, collapsed, manual) {
    if (entry.meta.frame === 'bare') return;
    if (manual) entry.manual = collapsed ? 'collapsed' : 'expanded';
    entry.collapsed = collapsed;
    entry.section.classList.toggle('vs-collapsed', collapsed);
    if (entry.collapseButton) {
      entry.collapseButton.textContent = vs.t(collapsed ? 'core.expand' : 'core.collapse');
      entry.collapseButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    if (entry.note) entry.note.textContent = vs.t(entry.outOfRoute && !entry.manual ? 'core.outOfRouteExpand' : 'core.expand');
  };

  vs.rerender = function (entry) {
    var body = runRender(entry);
    var actions = buildActions(entry);
    entry.actions.replaceWith(actions);
    entry.actions = actions;
    entry.body.replaceChildren();
    if (body) entry.body.appendChild(body);
    vs.setCollapsed(entry, !!entry.collapsed, false);
    vs.glossary.highlight(entry.body);
    vs.route.refocus(entry);
  };

  vs.entry = function (id) {
    for (var i = 0; i < vs.blocks.length; i++) if (vs.blocks[i].block.id === id) return vs.blocks[i];
    return null;
  };

  vs.el = el;
  vs.svg = svg;
  vs.icon = icon;
  vs.on = on;
  vs.off = off;
  vs.emit = emit;
  vs.toast = toast;
  vs.copy = copy;
  vs.sourceChip = sourceChip;
  vs.shortSha = shortSha;
  vs.register = function (type, render, meta) {
    renders[type] = { render: render, meta: meta || {} };
  };

  function start() {
    renderBar();
    var root = document.getElementById('verstat-root');
    var shown = 0;
    page.blocks.forEach(function (block) {
      var entry = makeEntry(block, shown);
      var body = runRender(entry);
      if (!body) {
        entry.offs.splice(0).forEach(function (fn) { fn(); });
        return;
      }
      shown++;
      root.appendChild(frame(entry, body));
      vs.blocks.push(entry);
      vs.setCollapsed(entry, false, false);
    });
    renderFooter();
    [
      ['glossary', function () {
        vs.glossary.init();
        vs.glossary.highlight(root);
      }],
      ['anchors', function () { vs.anchors.init(); }],
      ['route', function () { vs.route.init(); }],
    ].forEach(function (step) {
      try {
        step[1]();
      } catch (err) {
        console.error('verstat: ' + step[0] + ' failed to start', err);
      }
    });
    emit('ready', { blocks: vs.blocks.map(function (e) { return e.block.id; }) });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start);
})();
