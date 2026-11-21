(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});

  vs.diff = {
    setMode: function (entry, mode) {
      if (!entry.diffMode || entry.diffMode === mode) return;
      entry.diffMode = mode;
      vs.rerender(entry);
    },
  };
})();
