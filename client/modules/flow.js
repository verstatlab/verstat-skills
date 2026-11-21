(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});

  var SIDES = { t: 'Top', b: 'Bottom', l: 'Left', r: 'Right' };
  var SLOTS = { '': '50%', 1: '30%', 2: '70%' };
  var GROUP_PAD = 16;
  var GROUP_HEAD = 34;
  var LOOP_ROOM = 42;
  var CHEVRON = 7;
  var RANKSEP = 72;
  var RADIUS = 6;
  // flow.css stacks the edge-label layer above both levels.
  var EDGE_Z = 1;
  var EDGE_Z_ON = 2;

  function nodeSize(n) {
    if (n.type === 'start') return { w: 10, h: 10 };
    var title = String(n.title || '').length * 8.6;
    var sub = String(n.sub || '').length * 6.8;
    return { w: Math.round(Math.min(320, Math.max(96, Math.max(title, sub) + 30))), h: n.sub ? 50 : 40 };
  }

  function sidesFor(a, b, rankdir) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    if (rankdir === 'TB') {
      if (dy > a.h / 2) return ['b', 't'];
      if (dy < -a.h / 2) return ['r', 'r'];
      return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
    }
    if (dx > a.w / 2) return ['r', 'l'];
    if (dx < -a.w / 2) return ['b', 'b'];
    return dy >= 0 ? ['b', 't'] : ['t', 'b'];
  }

  function route(g, spec, rankdir, centers) {
    var LR = rankdir === 'LR';
    function R(p) { return LR ? p.x : p.y; }
    function O(p) { return LR ? p.y : p.x; }
    function P(r, o) { return LR ? { x: r, y: o } : { x: o, y: r }; }
    var ranks = [];
    function rankAt(r) {
      for (var i = 0; i < ranks.length; i++) if (Math.abs(ranks[i].r - r) < 0.5) return ranks[i];
      var k = { r: r, ext: 0 };
      ranks.push(k);
      return k;
    }
    spec.nodes.forEach(function (n) {
      var b = g.node('n:' + n.id);
      var k = rankAt(R(b));
      k.ext = Math.max(k.ext, (LR ? b.width : b.height) / 2);
    });
    function vis(id) {
      var b = centers[id];
      return LR
        ? { lo: b.y - b.h / 2, hi: b.y + b.h / 2, r0: b.x - b.w / 2, r1: b.x + b.w / 2 }
        : { lo: b.x - b.w / 2, hi: b.x + b.w / 2, r0: b.y - b.h / 2, r1: b.y + b.h / 2 };
    }
    var chains = [];
    spec.edges.forEach(function (e, i) {
      if (e.s === e.t) return;
      var d = g.edge({ v: 'n:' + e.s, w: 'n:' + e.t, name: 'e' + i });
      var inner = d.points.slice(1, -1).map(function (p) { return { r: R(p), o: O(p) }; });
      inner.forEach(function (p) { rankAt(p.r); });
      if (e.label) {
        var k = rankAt(R(d));
        k.ext = Math.max(k.ext, (LR ? d.width : d.height) / 2);
      }
      var rs = R(g.node('n:' + e.s));
      var rt = R(g.node('n:' + e.t));
      chains.push({ i: i, e: e, inner: inner, rs: rs, rt: rt, dir: rt < rs ? -1 : 1, label: e.label ? { x: d.x, y: d.y, w: d.width, h: d.height } : null });
    });

    var sides = {};
    var sideKeys = [];
    function onSide(key, item) {
      if (!sides[key]) { sides[key] = { id: item.id, list: [] }; sideKeys.push(key); }
      sides[key].list.push(item);
    }
    chains.forEach(function (c) {
      var next = c.inner.length ? c.inner[0].o : O(centers[c.e.t]);
      var prev = c.inner.length ? c.inner[c.inner.length - 1].o : O(centers[c.e.s]);
      onSide(c.e.s + '\u0000' + c.dir, { id: c.e.s, c: c, end: 's', key: next });
      onSide(c.e.t + '\u0000' + -c.dir, { id: c.e.t, c: c, end: 't', key: prev });
    });
    sideKeys.forEach(function (key) {
      var side = sides[key];
      var v = vis(side.id);
      side.list.sort(function (a, b) { return a.key - b.key || a.c.i - b.c.i || (a.end < b.end ? -1 : 1); });
      side.list.forEach(function (it, j) {
        var o = v.lo + (v.hi - v.lo) * (j + 1) / (side.list.length + 1);
        if (it.end === 's') it.c.os = o; else it.c.ot = o;
      });
    });

    var gaps = {};
    var gapKeys = [];
    chains.forEach(function (c) {
      var vs = vis(c.e.s);
      var vt = vis(c.e.t);
      c.stops = [{ r: c.dir > 0 ? vs.r1 : vs.r0, o: c.os, rank: c.rs }]
        .concat(c.inner.map(function (p) { return { r: p.r, o: p.o, rank: p.r }; }))
        .concat([{ r: c.dir > 0 ? vt.r0 : vt.r1, o: c.ot, rank: c.rt }]);
      c.turns = {};
      for (var j = 1; j < c.stops.length; j++) {
        var a = c.stops[j - 1];
        var b = c.stops[j];
        if (Math.abs(a.o - b.o) < 0.5) { b.o = a.o; continue; }
        var lo = Math.min(a.rank, b.rank);
        var hi = Math.max(a.rank, b.rank);
        var key = lo.toFixed(1) + ':' + hi.toFixed(1);
        if (!gaps[key]) { gaps[key] = { from: lo + rankAt(lo).ext, to: hi - rankAt(hi).ext, items: [] }; gapKeys.push(key); }
        var t = { i: c.i, o0: Math.min(a.o, b.o), o1: Math.max(a.o, b.o) };
        gaps[key].items.push(t);
        c.turns[j] = t;
      }
    });
    gapKeys.forEach(function (key) {
      var gap = gaps[key];
      var tracks = [];
      gap.items.sort(function (a, b) { return a.o0 - b.o0 || a.o1 - b.o1 || a.i - b.i; });
      gap.items.forEach(function (t) {
        var k = -1;
        for (var n = 0; n < tracks.length; n++) if (tracks[n] < t.o0 - 4) { k = n; break; }
        if (k < 0) { k = tracks.length; tracks.push(0); }
        tracks[k] = t.o1;
        t.track = k;
      });
      gap.items.forEach(function (t) { t.r = gap.from + (gap.to - gap.from) * (t.track + 1) / (tracks.length + 1); });
    });

    var out = {};
    chains.forEach(function (c) {
      var pts = [P(c.stops[0].r, c.stops[0].o)];
      var o = c.stops[0].o;
      for (var j = 1; j < c.stops.length; j++) {
        var t = c.turns[j];
        if (t) {
          pts.push(P(t.r, o));
          pts.push(P(t.r, c.stops[j].o));
          o = c.stops[j].o;
        }
      }
      var last = c.stops[c.stops.length - 1];
      pts.push(P(last.r, last.o));
      var entry = LR ? (c.dir > 0 ? 'left' : 'right') : (c.dir > 0 ? 'top' : 'bottom');
      out[c.i] = { points: pts, label: c.label, entry: entry };
    });
    return out;
  }

  function layout(spec) {
    var rankdir = spec.rankdir === 'TB' ? 'TB' : 'LR';
    var groupIds = new Set((spec.groups || []).map(function (g) { return g.id; }));
    var g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
    g.setGraph({ rankdir: rankdir, nodesep: 36, ranksep: RANKSEP, edgesep: 18, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(function () { return {}; });
    var sizes = {};
    var selfLoops = {};
    spec.edges.forEach(function (e) { if (e.s === e.t) selfLoops[e.s] = (selfLoops[e.s] || 0) + 1; });
    var room = {};
    (spec.groups || []).forEach(function (gr) { g.setNode('g:' + gr.id, { paddingTop: GROUP_HEAD }); });
    spec.nodes.forEach(function (n) {
      sizes[n.id] = nodeSize(n);
      var k = selfLoops[n.id] || 0;
      var ups = Math.ceil(k / 2);
      var downs = Math.floor(k / 2);
      room[n.id] = { top: ups ? LOOP_ROOM + (ups - 1) * 16 : 0, bottom: downs ? LOOP_ROOM + (downs - 1) * 16 : 0 };
      g.setNode('n:' + n.id, { width: sizes[n.id].w, height: sizes[n.id].h + room[n.id].top + room[n.id].bottom });
      if (n.group && groupIds.has(n.group)) g.setParent('n:' + n.id, 'g:' + n.group);
    });
    spec.edges.forEach(function (e, i) {
      if (e.s === e.t) return;
      var lines = e.label ? String(e.label).split('\n') : [];
      var longest = Math.max.apply(null, lines.map(function (l) { return l.length; }).concat([0]));
      var label = lines.length ? { width: Math.round(longest * 6.6 + 14), height: 16 * lines.length + 4, labelpos: 'c' } : {};
      g.setEdge('n:' + e.s, 'n:' + e.t, label, 'e' + i);
    });
    dagre.layout(g);

    var centers = {};
    spec.nodes.forEach(function (n) {
      var b = g.node('n:' + n.id);
      centers[n.id] = { x: b.x, y: b.y + (room[n.id].top - room[n.id].bottom) / 2, w: sizes[n.id].w, h: sizes[n.id].h };
    });
    var frames = (spec.groups || []).map(function (gr) {
      var kids = spec.nodes.filter(function (n) { return n.group === gr.id; });
      if (!kids.length) return null;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      kids.forEach(function (n) {
        var c = centers[n.id];
        x0 = Math.min(x0, c.x - c.w / 2);
        y0 = Math.min(y0, c.y - c.h / 2 - room[n.id].top);
        x1 = Math.max(x1, c.x + c.w / 2);
        y1 = Math.max(y1, c.y + c.h / 2 + room[n.id].bottom);
      });
      return { id: gr.id, title: gr.title, x: x0 - GROUP_PAD, y: y0 - GROUP_HEAD, w: x1 - x0 + 2 * GROUP_PAD, h: y1 - y0 + GROUP_HEAD + GROUP_PAD };
    }).filter(Boolean);
    var routes = route(g, spec, rankdir, centers);
    var frameById = {};
    frames.forEach(function (f) { frameById[f.id] = f; });

    var nodes = spec.nodes.map(function (n) {
      var c = centers[n.id];
      var frame = n.group && frameById[n.group];
      var x = c.x - c.w / 2;
      var y = c.y - c.h / 2;
      return {
        id: n.id,
        group: frame ? frame.id : null,
        w: c.w,
        h: c.h,
        x: x,
        y: y,
        position: frame ? { x: x - frame.x, y: y - frame.y } : { x: x, y: y },
      };
    });

    var pairs = {};
    var loops = {};
    var edges = spec.edges.map(function (e, i) {
      var id = 'e' + i;
      if (e.s === e.t) {
        var k = loops[e.s] = (loops[e.s] || 0) + 1;
        var up = k % 2 === 1;
        var side = up ? 't' : 'b';
        return { id: id, type: 'loop', sh: side + '1', th: side + '2', up: up, offset: 22 + Math.floor((k - 1) / 2) * 16 };
      }
      var key = [e.s, e.t].sort().join('\u0000');
      var nth = pairs[key] = (pairs[key] || 0) + 1;
      var sides = sidesFor(centers[e.s], centers[e.t], rankdir);
      var slot = nth === 1 ? '' : String(((nth - 2) % 2) + 1);
      var rt = routes[i];
      return {
        id: id, type: 'vs', sh: sides[0] + slot, th: sides[1] + slot, offset: 16 + (nth - 1) * 10,
        points: rt.points, label: rt.label, entry: rt.entry,
      };
    });

    var all = nodes.map(function (n) { return [n.x, n.y, n.x + n.w, n.y + n.h]; })
      .concat(frames.map(function (f) { return [f.x, f.y, f.x + f.w, f.y + f.h]; }));
    var width = Math.max.apply(null, all.map(function (b) { return b[2]; }).concat([0]));
    var height = Math.max.apply(null, all.map(function (b) { return b[3]; }).concat([0]));
    return { nodes: nodes, groups: frames, edges: edges, width: width, height: height };
  }

  function toNodes(lay, spec, view, prev, onActivate) {
    var hl = new Set(view.hl || []);
    var focus = view.focus === undefined ? null : view.focus;
    var specById = {};
    spec.nodes.forEach(function (n) { specById[n.id] = n; });
    var at = {};
    (prev || []).forEach(function (n) { at[n.id] = n; });
    var groups = lay.groups.map(function (f) {
      var old = at[f.id];
      return {
        id: f.id, type: 'repo', position: old ? old.position : { x: f.x, y: f.y },
        data: { title: f.title, w: f.w, h: f.h, part: f.id, focus: focus === f.id },
        style: { width: f.w, height: f.h }, zIndex: -1, selectable: false,
        width: old && old.width, height: old && old.height,
      };
    });
    var nodes = lay.nodes.map(function (n) {
      var s = specById[n.id];
      var old = at[n.id];
      var part = s.part === undefined ? n.id : s.part;
      return {
        id: n.id,
        type: s.type || 'vs',
        position: old ? old.position : n.position,
        parentNode: n.group || undefined,
        selectable: false,
        style: { width: n.w, height: n.h },
        width: old && old.width,
        height: old && old.height,
        data: {
          id: n.id, part: part, title: s.title, sub: s.sub, note: s.note, w: n.w, h: n.h,
          hot: s.hot, dash: s.dash, tone: s.tone, final: s.final, click: s.click,
          hl: hl.has(n.id), focus: part !== null && focus === part, onActivate: onActivate,
        },
      };
    });
    return groups.concat(nodes);
  }

  function frameAt(frames, x, y) {
    for (var i = 0; i < (frames || []).length; i++) {
      var f = frames[i];
      if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return f;
    }
    return null;
  }

  function frameRects(nodes) {
    return nodes.filter(function (n) { return n.type === 'repo'; }).map(function (n) {
      return { id: n.id, x: n.position.x, y: n.position.y, w: n.style.width, h: n.style.height };
    });
  }

  function toEdges(lay, spec, view, onPick, moved, frames) {
    var focus = view.focus === undefined ? null : view.focus;
    return lay.edges.map(function (le, i) {
      var e = spec.edges[i];
      var part = e.part === undefined ? null : e.part;
      var on = !!e.on || (e.key !== undefined && e.key !== null && view.sel === e.key);
      var routed = le.points && !(moved && (moved.has(e.s) || moved.has(e.t)));
      return {
        id: le.id, source: e.s, target: e.t, sourceHandle: 's-' + le.sh, targetHandle: 't-' + le.th, type: le.type,
        data: {
          label: e.label, aria: e.aria, tone: e.tone, dash: e.dash, key: e.key, part: part, on: on,
          focus: part !== null && focus === part,
          offset: le.offset, up: le.up, onPick: e.key !== undefined && e.key !== null ? onPick : null,
          points: routed ? le.points : undefined, at: routed ? le.label : undefined, entry: routed ? le.entry : undefined,
          frames: frames || [],
        },
        zIndex: on ? EDGE_Z_ON : EDGE_Z,
      };
    });
  }

  function roundedPath(points) {
    var pts = [];
    points.forEach(function (p) {
      var q = pts[pts.length - 1];
      if (q && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) return;
      var o = pts[pts.length - 2];
      if (o && q && ((Math.abs(o.x - q.x) < 0.01 && Math.abs(q.x - p.x) < 0.01) || (Math.abs(o.y - q.y) < 0.01 && Math.abs(q.y - p.y) < 0.01))) pts.pop();
      pts.push(p);
    });
    var d = 'M' + pts[0].x + ' ' + pts[0].y;
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var la = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      var lc = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
      var r = Math.min(RADIUS, la / 2, lc / 2);
      var ax = b.x + Math.sign(a.x - b.x) * r, ay = b.y + Math.sign(a.y - b.y) * r;
      var cx = b.x + Math.sign(c.x - b.x) * r, cy = b.y + Math.sign(c.y - b.y) * r;
      d += ' L' + ax + ' ' + ay + ' Q' + b.x + ' ' + b.y + ' ' + cx + ' ' + cy;
    }
    var end = pts[pts.length - 1];
    return d + ' L' + end.x + ' ' + end.y;
  }

  var types = null;

  function chevron(h, x, y, position, cls) {
    var c = CHEVRON;
    var w = c * 0.65;
    var pts = {
      left: [[x - c, y - w], [x, y], [x - c, y + w]],
      right: [[x + c, y - w], [x, y], [x + c, y + w]],
      top: [[x - w, y - c], [x, y], [x + w, y - c]],
      bottom: [[x - w, y + c], [x, y], [x + w, y + c]],
    }[position] || [];
    return h('polyline', { className: 'vs-flow-chevron ' + cls, points: pts.map(function (p) { return p.join(','); }).join(' ') });
  }

  function makeTypes(RF) {
    var h = React.createElement;

    function handles() {
      var out = [];
      Object.keys(SIDES).forEach(function (side) {
        Object.keys(SLOTS).forEach(function (slot) {
          var place = side === 't' || side === 'b' ? { left: SLOTS[slot] } : { top: SLOTS[slot] };
          ['s', 't'].forEach(function (kind) {
            out.push(h(RF.Handle, {
              key: kind + side + slot,
              id: kind + '-' + side + slot,
              type: kind === 's' ? 'source' : 'target',
              position: RF.Position[SIDES[side]],
              isConnectable: false,
              className: 'vs-flow-handle',
              style: place,
            }));
          });
        });
      });
      return out;
    }

    function activate(data, e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (data.onActivate) data.onActivate(data.id);
    }

    function VsNode(p) {
      var d = p.data;
      var cls = ['vs-flow-node'];
      if (d.hot) cls.push('is-hot');
      if (d.dash) cls.push('is-dash');
      if (d.tone) cls.push('is-' + d.tone);
      if (d.final) cls.push('is-final');
      if (d.hl) cls.push('is-hl');
      if (d.focus) cls.push('vs-focus');
      if (d.click) cls.push('is-click');
      return h('div', {
        className: cls.join(' '),
        style: { width: d.w, height: d.h },
        'data-part': d.part,
        role: d.click ? 'button' : undefined,
        tabIndex: d.click ? 0 : undefined,
        'aria-label': d.title + (d.sub ? ' · ' + d.sub : ''),
        title: d.note || undefined,
        onKeyDown: d.click ? function (e) { activate(d, e); } : undefined,
      }, handles().concat([
        h('div', { key: 't', className: 'vs-flow-title' }, d.title),
        d.sub ? h('div', { key: 's', className: 'vs-flow-sub' }, d.sub) : null,
      ]));
    }

    function GroupNode(p) {
      var d = p.data;
      return h('div', {
        className: 'vs-flow-group' + (d.focus ? ' vs-focus' : ''),
        style: { width: d.w, height: d.h },
        'data-part': d.part,
      }, d.title);
    }

    function StartNode() {
      return h('div', { className: 'vs-flow-start' }, handles());
    }

    function edgeClass(d) {
      var cls = ['vs-flow-edge'];
      if (d.tone) cls.push('is-' + d.tone);
      if (d.on) cls.push('is-on');
      if (d.dash) cls.push('is-dash');
      if (d.focus) cls.push('vs-focus');
      return cls.join(' ');
    }

    // The label is also the keyboard target of a pickable edge; without text it is an invisible stop.
    function label(d, x, y) {
      var pick = !!d.onPick;
      if (!d.label && !pick) return null;
      return h(RF.EdgeLabelRenderer, null, h('div', {
        className: 'vs-flow-label nodrag nopan ' + edgeClass(d) + (pick ? ' is-click' : '') + (d.label ? '' : ' is-empty') + (frameAt(d.frames, x, y) ? ' is-framed' : ''),
        style: { transform: 'translate(-50%, -50%) translate(' + x + 'px,' + y + 'px)' },
        role: pick ? 'button' : undefined,
        tabIndex: pick ? 0 : undefined,
        'aria-label': pick && d.aria ? d.aria : undefined,
        onClick: pick ? function () { d.onPick(d.key); } : undefined,
        onKeyDown: pick ? function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            d.onPick(d.key);
          }
        } : undefined,
      }, d.label));
    }

    function VsEdge(p) {
      var d = p.data;
      var cls = edgeClass(d);
      if (d.points) {
        var path = roundedPath(d.points);
        var end = d.points[d.points.length - 1];
        var k = Math.max(1, Math.floor(d.points.length / 2));
        var mid = d.at || { x: (d.points[k - 1].x + d.points[k].x) / 2, y: (d.points[k - 1].y + d.points[k].y) / 2 };
        return h(React.Fragment, null,
          h('path', { d: path, className: 'vs-flow-hit' }),
          h('path', { d: path, className: cls, 'data-part': d.part }),
          chevron(h, end.x, end.y, d.entry, cls),
          label(d, mid.x, mid.y));
      }
      var res = RF.getSmoothStepPath({
        sourceX: p.sourceX, sourceY: p.sourceY, sourcePosition: p.sourcePosition,
        targetX: p.targetX, targetY: p.targetY, targetPosition: p.targetPosition,
        borderRadius: RADIUS, offset: d.offset || 16,
      });
      return h(React.Fragment, null,
        h('path', { d: res[0], className: 'vs-flow-hit' }),
        h('path', { d: res[0], className: cls, 'data-part': d.part }),
        chevron(h, p.targetX, p.targetY, p.targetPosition, cls),
        label(d, res[1], res[2]));
    }

    function LoopEdge(p) {
      var d = p.data;
      var dir = d.up ? -1 : 1;
      var r = 6;
      var sx = p.sourceX, sy = p.sourceY, tx = p.targetX, ty = p.targetY;
      var y = (d.up ? Math.min(sy, ty) : Math.max(sy, ty)) + dir * (d.offset || 22);
      var path = 'M' + sx + ' ' + sy + ' L' + sx + ' ' + (y - dir * r) +
        ' Q' + sx + ' ' + y + ' ' + (sx + r) + ' ' + y + ' L' + (tx - r) + ' ' + y +
        ' Q' + tx + ' ' + y + ' ' + tx + ' ' + (y - dir * r) + ' L' + tx + ' ' + ty;
      var cls = edgeClass(d);
      return h(React.Fragment, null,
        h('path', { d: path, className: 'vs-flow-hit' }),
        h('path', { d: path, className: cls, 'data-part': d.part }),
        chevron(h, tx, ty, d.up ? 'top' : 'bottom', cls),
        label(d, (sx + tx) / 2, y + dir * 11));
    }

    return {
      nodes: { vs: VsNode, repo: GroupNode, start: StartNode },
      edges: { vs: VsEdge, loop: LoopEdge },
    };
  }

  function coarse() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function IconBtn(props) {
    var h = React.createElement;
    return h('button', { type: 'button', className: 'vs-flow-btn', title: props.title, 'aria-label': props.title, onClick: props.onClick },
      h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': 'true' }, h('path', { d: props.d })));
  }

  function movedNodes(lay, nodes) {
    var pos = {};
    nodes.forEach(function (n) { pos[n.id] = n; });
    function abs(id) {
      var n = pos[id];
      if (!n) return null;
      var parent = n.parentNode ? abs(n.parentNode) : { x: 0, y: 0 };
      return parent && { x: parent.x + n.position.x, y: parent.y + n.position.y };
    }
    var out = new Set();
    lay.nodes.forEach(function (n) {
      var a = abs(n.id);
      if (a && (Math.abs(a.x - n.x) > 0.5 || Math.abs(a.y - n.y) > 0.5)) out.add(n.id);
    });
    return out;
  }

  function Diagram(props) {
    var RF = window.ReactFlow;
    var h = React.createElement;
    var api = RF.useReactFlow();
    var lay = props.layout;
    var touch = React.useMemo(coarse, []);
    var activeState = React.useState(false);
    var active = activeState[0];
    var setActive = activeState[1];
    var touched = React.useRef(false);
    var box = React.useRef(null);

    var cb = React.useRef(props);
    cb.current = props;
    var onNode = React.useCallback(function (id) { if (cb.current.onNodeClick) cb.current.onNodeClick(id); }, []);
    var onPick = React.useCallback(function (key) {
      setActive(true);
      if (cb.current.onEdgeClick) cb.current.onEdgeClick(key);
    }, []);

    function build(prev) {
      return toNodes(lay, props.spec, { hl: props.hl, focus: props.focus }, prev, onNode);
    }

    var sig = JSON.stringify([props.hl || [], props.focus || null]);
    var state = React.useState(function () { return build(null); });
    var nodes = state[0];
    var setNodes = state[1];
    React.useEffect(function () { setNodes(function (prev) { return build(prev); }); }, [sig]);
    var onNodesChange = React.useCallback(function (changes) {
      setNodes(function (ns) { return RF.applyNodeChanges(changes, ns); });
    }, []);

    var frames = React.useMemo(function () { return frameRects(nodes); }, [nodes]);
    var edges = toEdges(lay, props.spec, { sel: props.sel, focus: props.focus }, onPick, movedNodes(lay, nodes), frames);

    var apiRef = React.useRef(api);
    apiRef.current = api;
    function fit(duration) { apiRef.current.fitView({ padding: 0.08, duration: duration || 0 }); }
    function reset() {
      touched.current = false;
      setNodes(build(null));
      setTimeout(function () { fit(250); }, 30);
    }

    React.useEffect(function () {
      if (!active) return undefined;
      var outside = function (e) { if (box.current && !box.current.contains(e.target)) setActive(false); };
      document.addEventListener('pointerdown', outside, true);
      return function () { document.removeEventListener('pointerdown', outside, true); };
    }, [active]);

    React.useEffect(function () {
      if (!box.current || typeof ResizeObserver === 'undefined') return undefined;
      var last = 0;
      var ro = new ResizeObserver(function (entries) {
        var w = entries[0].contentRect.width;
        if (w > 0 && w !== last && !touched.current) requestAnimationFrame(function () { fit(0); });
        last = w;
      });
      ro.observe(box.current);
      return function () { ro.disconnect(); };
    }, []);

    var Flow = RF.default || RF.ReactFlow;
    var free = active || !touch;
    var hint = touch
      ? vs.t(active ? 'flow.hintTouchActive' : 'flow.hintTouch')
      : vs.t(active ? 'flow.hintActive' : 'flow.hint');

    return h('div', {
      ref: box,
      className: 'vs-flow' + (active ? ' is-active' : ''),
      style: { height: props.height || 420 },
      role: 'group',
      'aria-label': props.ariaLabel,
      onMouseLeave: function () { setActive(false); },
    }, h(Flow, {
      nodes: nodes,
      edges: edges,
      nodeTypes: types.nodes,
      edgeTypes: types.edges,
      onNodesChange: onNodesChange,
      onNodeClick: function (_, n) {
        setActive(true);
        if (n.type === 'vs' && props.onNodeClick) props.onNodeClick(n.id);
      },
      onNodeMouseEnter: function (_, n) { if (n.type === 'vs' && props.onNodeEnter) props.onNodeEnter(n.id); },
      onNodeMouseLeave: function (_, n) { if (n.type === 'vs' && props.onNodeLeave) props.onNodeLeave(n.id); },
      onEdgeClick: function (_, e) {
        setActive(true);
        if (e.data && e.data.key !== undefined && props.onEdgeClick) props.onEdgeClick(e.data.key);
      },
      onPaneClick: function () { setActive(true); },
      onNodeDragStart: function () { touched.current = true; },
      onMoveStart: function (event) { if (event) touched.current = true; },
      fitView: true,
      fitViewOptions: { padding: 0.08 },
      minZoom: 0.3,
      maxZoom: 2,
      nodeDragThreshold: 4,
      zoomOnScroll: active,
      preventScrolling: active,
      zoomOnPinch: true,
      panOnDrag: free,
      nodesDraggable: free,
      zoomOnDoubleClick: false,
      nodesConnectable: false,
      elementsSelectable: false,
      attributionPosition: 'top-right',
      nodesFocusable: false,
      edgesFocusable: false,
    },
    h(RF.Panel, { position: 'bottom-right' }, h('div', { className: 'vs-flow-tools' }, [
      h(IconBtn, { key: 'in', title: vs.t('flow.zoomIn'), d: 'M12 5v14M5 12h14', onClick: function () { touched.current = true; api.zoomIn({ duration: 150 }); } }),
      h(IconBtn, { key: 'out', title: vs.t('flow.zoomOut'), d: 'M5 12h14', onClick: function () { touched.current = true; api.zoomOut({ duration: 150 }); } }),
      h(IconBtn, { key: 'fit', title: vs.t('flow.fit'), d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', onClick: reset }),
    ])),
    h(RF.Panel, { position: 'bottom-left' }, h('span', { className: 'vs-flow-hint' }, hint))));
  }

  function Root(props) {
    return React.createElement(window.ReactFlow.ReactFlowProvider, null, React.createElement(Diagram, props));
  }

  function mount(container, props) {
    if (!types) types = makeTypes(window.ReactFlow);
    var current = Object.assign({}, props, { layout: layout(props.spec) });
    if (container.setAttribute) container.setAttribute('data-no-terms', '');
    var root = ReactDOM.createRoot(container);
    root.render(React.createElement(Root, current));
    return {
      update: function (patch) {
        if (patch && (patch.spec || patch.layout)) throw new Error('verstat.flow: spec is set at mount; destroy and mount again');
        current = Object.assign({}, current, patch);
        root.render(React.createElement(Root, current));
      },
      destroy: function () { root.unmount(); },
    };
  }

  vs.flow = { layout: layout, toNodes: toNodes, toEdges: toEdges, movedNodes: movedNodes, frameAt: frameAt, mount: mount };
})();
