(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});
  var SPY_LINE = 180;
  var FREEZE_MS = 900;
  var HASH_OFFSET = 90;
  var RAIL_QUERY = '(min-width: 1280px)';

  var steps = [];
  var mode = 'full';
  var active = -1;
  var focused = null;
  var frozenUntil = 0;
  var ticking = false;
  var rail = null;
  var strip = null;

  function labels() {
    var kind = vs.page.skill === 'explain-pr' ? 'pr' : 'explain';
    var out = {};
    ['short', 'full'].forEach(function (m) {
      var total = Math.ceil(minutes(steps.filter(function (s) { return s.modes.indexOf(m) >= 0; })));
      out[m] = vs.t('route.minutes', { n: total > 0 ? total : 1 }) + ' · ' + vs.t('route.mode.' + kind + '.' + m);
    });
    return out;
  }

  function visible() {
    return steps.filter(function (s) { return s.modes.indexOf(mode) >= 0; });
  }

  function titleOf(entry) {
    return entry.block.title || vs.label(entry.block.type, entry.meta);
  }

  function minutes(list) {
    var total = list.reduce(function (sum, s) { return sum + (Number(s.minutes) || 0); }, 0);
    return Math.round(total * 10) / 10;
  }

  function state() {
    var list = visible();
    return {
      mode: mode,
      steps: list.map(function (s) {
        return { index: s.index, block: s.block, focus: s.focus || null, minutes: s.minutes, why: s.why, modes: s.modes, title: titleOf(s.entry), number: s.entry.number };
      }),
      active: active,
      minutes: minutes(list),
      labels: labels(),
    };
  }

  function modeSeg(wide) {
    var l = labels();
    var seg = vs.el('div', { class: 'vs-seg' + (wide ? ' vs-seg-wide' : ''), role: 'group', 'aria-label': vs.t('route.modeAria') });
    ['short', 'full'].forEach(function (m) {
      seg.appendChild(vs.el('button', {
        type: 'button',
        'data-mode': m,
        'aria-pressed': m === mode ? 'true' : 'false',
        disabled: !steps.some(function (s) { return s.modes.indexOf(m) >= 0; }),
        title: steps.some(function (s) { return s.modes.indexOf(m) >= 0; }) ? null : vs.t('route.noSteps'),
        onclick: function () { setMode(m); },
      }, wide ? l[m] : l[m].split(' · ')[0]));
    });
    return seg;
  }

  function stepClass(s, base) {
    var list = visible();
    var pos = list.indexOf(s);
    var at = list.indexOf(steps[active]);
    if (pos === at) return base + ' vs-current';
    if (at >= 0 && pos < at) return base + ' vs-passed';
    return base;
  }

  function renderRail() {
    var list = visible();
    var at = list.indexOf(steps[active]);
    rail.replaceChildren(
      vs.el('div', { class: 'vs-rail-section' }, [
        vs.el('span', { class: 'vs-label' }, vs.t('route.question')),
        vs.el('span', { class: 'vs-rail-question' }, vs.page.question),
        vs.read && vs.read.widget(),
      ]),
      vs.el('div', { class: 'vs-rail-section' }, [vs.el('span', { class: 'vs-label' }, vs.t('route.route')), modeSeg(true)]),
      vs.el('div', { class: 'vs-steps' }, list.map(function (s) {
        return vs.el('button', {
          type: 'button',
          class: stepClass(s, 'vs-step'),
          'data-step': s.index,
          'aria-current': steps[active] === s ? 'step' : null,
          onclick: function () { go(s.index); },
        }, [
          vs.el('span', { class: 'vs-step-marker' }),
          vs.el('span', { class: 'vs-step-text' }, [
            vs.el('span', { class: 'vs-step-title' }, titleOf(s.entry)),
            vs.el('span', { class: 'vs-step-why' }, s.why),
          ]),
          vs.el('span', { class: 'vs-step-min' }, vs.t('route.minutes', { n: s.minutes })),
        ]);
      })),
      vs.el('div', { class: 'vs-rail-foot' }, [
        vs.el('span', {}, vs.t('route.stepOf', { at: at >= 0 ? at + 1 : 1, total: list.length })),
        vs.el('span', {}, vs.t('route.total', { n: minutes(list) })),
      ]),
    );
  }

  function renderStrip() {
    var list = visible();
    var row = vs.el('div', { class: 'vs-strip-steps' }, list.map(function (s, i) {
      return vs.el('button', {
        type: 'button',
        class: stepClass(s, 'vs-strip-step'),
        'data-step': s.index,
        'aria-current': steps[active] === s ? 'step' : null,
        onclick: function () { go(s.index); },
      }, [
        vs.el('span', { class: 'vs-strip-step-num' }, String(i + 1).padStart(2, '0') + ' · ' + vs.t('route.minutes', { n: s.minutes })),
        vs.el('span', { class: 'vs-strip-step-title' }, titleOf(s.entry)),
      ]);
    }));
    strip.replaceChildren(vs.el('div', { class: 'vs-strip-modes' }, modeSeg(false)), row);
    var cur = row.querySelector('.vs-current');
    if (cur && row.scrollWidth > row.clientWidth) {
      row.scrollLeft = Math.max(0, cur.offsetLeft - row.offsetLeft - row.clientWidth / 2 + cur.offsetWidth / 2);
    }
  }

  function focusedStep() {
    var a = document.activeElement;
    if (!a || !a.getAttribute || a.getAttribute('data-step') === null) return null;
    var box = a.closest('#vs-rail, #vs-strip, .vs-route');
    return box ? { box: box, step: a.getAttribute('data-step') } : null;
  }

  function restoreFocus(had) {
    if (!had) return;
    var b = had.box.querySelector('[data-step="' + had.step + '"]');
    if (b && b !== document.activeElement) b.focus({ preventScroll: true });
  }

  function paint() {
    if (!steps.length) return;
    var had = focusedStep();
    renderRail();
    renderStrip();
    var activeBlock = steps[active] ? steps[active].block : null;
    vs.blocks.forEach(function (e) { e.section.classList.toggle('vs-active', e.block.id === activeBlock); });
    vs.emit('route', state());
    restoreFocus(had);
  }

  function applyMode() {
    var inMode = {};
    visible().forEach(function (s) { inMode[s.block] = true; });
    vs.blocks.forEach(function (e) {
      e.outOfRoute = !inMode[e.block.id];
      var collapsed = e.manual ? e.manual === 'collapsed' : e.outOfRoute;
      vs.setCollapsed(e, collapsed, false);
    });
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    applyMode();
    var list = visible();
    if (list.indexOf(steps[active]) < 0) active = list.length ? list[0].index : -1;
    paint();
    spy();
  }

  function offset() {
    if (window.matchMedia(RAIL_QUERY).matches) return 8;
    return (strip ? strip.offsetHeight : 0) + 8;
  }

  function clearFocus() {
    document.querySelectorAll('.vs-focus').forEach(function (n) { n.classList.remove('vs-focus'); });
  }

  function partNode(entry, id) {
    var nodes = entry.section.querySelectorAll('[data-part]');
    for (var i = 0; i < nodes.length; i++) if (nodes[i].getAttribute('data-part') === id) return nodes[i];
    return null;
  }

  function applyFocus(entry, part, quiet) {
    clearFocus();
    focused = part ? { block: entry.block.id, part: part } : null;
    if (!part) {
      if (!quiet) vs.emit('focus', { block: entry.block.id, part: null });
      return;
    }
    var node = partNode(entry, part);
    if (node) node.classList.add('vs-focus');
    entry.focusHandlers.forEach(function (fn) {
      try {
        fn(part);
      } catch (err) {
        console.error('verstat: focus handler of "' + entry.block.id + '" failed', err);
      }
    });
    if (quiet) return;
    vs.emit('focus', { block: entry.block.id, part: part });
    try {
      document.dispatchEvent(new CustomEvent('verstat:focus', { detail: { block: entry.block.id, part: part } }));
    } catch (err) {
      return;
    }
  }

  function go(index) {
    var s = steps[index];
    if (!s) return;
    if (s.entry.collapsed) vs.setCollapsed(s.entry, false, true);
    active = index;
    frozenUntil = Date.now() + FREEZE_MS;
    var top = s.entry.section.getBoundingClientRect().top + window.pageYOffset - offset();
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
    applyFocus(s.entry, s.focus || null);
    paint();
  }

  function spy() {
    ticking = false;
    if (!steps.length || Date.now() < frozenUntil) return;
    var list = visible();
    var line = window.matchMedia(RAIL_QUERY).matches ? SPY_LINE : Math.max(SPY_LINE, (strip ? strip.offsetHeight : 0) + 16);
    var root = document.documentElement;
    var atBottom = window.innerHeight + window.pageYOffset >= root.scrollHeight - 2;
    var found = null;
    var foundTop = -Infinity;
    var first = null;
    var firstTop = Infinity;
    list.forEach(function (s) {
      var top = s.entry.section.getBoundingClientRect().top;
      if ((atBottom || top < line) && top > foundTop) {
        found = s;
        foundTop = top;
      }
      if (top < firstTop) {
        first = s;
        firstTop = top;
      }
    });
    if (!found) found = first;
    if (!found) return;
    var cur = steps[active];
    if (cur && cur.block === found.block && list.indexOf(cur) >= 0) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i].block === found.block) {
        found = list[i];
        break;
      }
    }
    if (found.index !== active) {
      active = found.index;
      paint();
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(spy);
  }

  function jumpToHash() {
    var id;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch (err) {
      return;
    }
    if (!id) return;
    var target = document.getElementById(id) || document.getElementById('block-' + id);
    if (!target) return;
    var section = target.closest('.vs-block');
    var entry = section && vs.entry(section.getAttribute('data-block'));
    if (entry && entry.collapsed) vs.setCollapsed(entry, false, true);
    var top = target.getBoundingClientRect().top + window.pageYOffset - HASH_OFFSET;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }

  vs.route = {
    state: state,
    go: go,
    setMode: setMode,
    refocus: function (entry) {
      if (focused && focused.block === entry.block.id) applyFocus(entry, focused.part, true);
    },
    init: function () {
      window.addEventListener('hashchange', jumpToHash);
      setTimeout(jumpToHash);
      rail = document.getElementById('vs-rail');
      strip = document.getElementById('vs-strip');
      rail.setAttribute('aria-label', vs.t('route.route'));
      strip.setAttribute('aria-label', vs.t('route.route'));
      var all = vs.page.route || [];
      all.forEach(function (s) {
        var entry = vs.entry(s.block);
        if (!entry) return;
        steps.push({ index: steps.length, block: s.block, focus: s.focus, minutes: s.minutes, why: s.why, modes: s.modes, entry: entry });
      });
      if (!steps.length) {
        vs.emit('route', state());
        return;
      }
      document.body.classList.add('vs-has-route');
      if (!visible().length) mode = steps[0].modes[0];
      active = visible()[0].index;
      applyMode();
      paint();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      spy();
    },
  };
})();
