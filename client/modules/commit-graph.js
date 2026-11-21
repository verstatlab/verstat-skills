(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});
  var COLORS = 5;

  function free(lanes) {
    var at = lanes.indexOf(null);
    if (at < 0) {
      at = lanes.length;
      lanes.push(null);
    }
    return at;
  }

  vs.commitGraph = function (list) {
    var index = {};
    list.forEach(function (c, i) { index[c.sha] = i; });
    var lanes = [];
    var colors = [];
    var next = 0;
    var width = 0;
    var last = null;
    var rows = list.map(function (c, i) {
      var col = lanes.indexOf(c.sha);
      if (col < 0) {
        col = free(lanes);
        colors[col] = !c.parents && last !== null ? last : next++ % COLORS;
      }
      var before = lanes.slice();
      var beforeColors = colors.slice();
      var color = colors[col];
      var into = [];
      before.forEach(function (v, k) {
        if (v !== c.sha) return;
        into.push(k);
        lanes[k] = null;
      });
      var outs = [];
      (c.parents || []).forEach(function (p, n) {
        if (!(index[p] > i)) return;
        var j = lanes.indexOf(p);
        if (j < 0) {
          if (n === 0 && lanes[col] === null) {
            j = col;
            colors[j] = color;
          } else {
            j = free(lanes);
            colors[j] = next++ % COLORS;
          }
          lanes[j] = p;
        }
        outs.push(j);
      });
      while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
      var pass = [];
      before.forEach(function (v, k) {
        if (v && v !== c.sha && lanes[k] === v) pass.push(k);
      });
      width = Math.max(width, before.length, lanes.length, col + 1);
      last = color;
      return { col: col, color: color, into: into, outs: outs, pass: pass, beforeColors: beforeColors, afterColors: colors.slice() };
    });
    return { rows: rows, lanes: width };
  };
})();
