(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});

  // paths → Map(path → label): the last k segments, k grown per path only while its label
  // collides with another's. short(name) may rewrite the file segment (0037-x.md → ADR 0037); a label that
  // still collides at full depth drops the rewrite, so distinct paths always get distinct labels.
  vs.pathLabels = function (list, short) {
    var paths = list.filter(function (p, i) { return list.indexOf(p) === i; });
    var parts = {};
    var depth = {};
    var raw = {};
    paths.forEach(function (p) {
      parts[p] = p.split('/');
      depth[p] = 1;
    });

    function label(p) {
      if (raw[p]) return p;
      var segs = parts[p].slice(-depth[p]);
      if (short) segs[segs.length - 1] = short(segs[segs.length - 1]);
      return segs.join('/');
    }

    for (;;) {
      var groups = {};
      paths.forEach(function (p) {
        var l = label(p);
        (groups[l] = groups[l] || []).push(p);
      });
      var clash = [];
      Object.keys(groups).forEach(function (l) {
        if (groups[l].length > 1) clash = clash.concat(groups[l]);
      });
      if (!clash.length) break;
      clash.forEach(function (p) {
        if (depth[p] < parts[p].length) depth[p]++;
        else raw[p] = true;
      });
    }

    var out = new Map();
    paths.forEach(function (p) { out.set(p, label(p)); });
    return out;
  };
})();
