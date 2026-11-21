(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});

  vs.mermaid = {
    attach: function (ctx, fn) {
      ctx.action(vs.t('mermaid.copy'), function () {
        var text;
        try {
          text = fn();
        } catch (err) {
          console.error('verstat: Mermaid text of "' + ctx.block.id + '" failed', err);
          ctx.toast(vs.t('mermaid.failed'));
          return;
        }
        ctx.copy(text, vs.t('mermaid.copied'));
      });
    },
    id: function (s) {
      var id = String(s).replace(/[^A-Za-z0-9]/g, function (c) { return '_' + c.codePointAt(0).toString(36) + '_'; });
      return 'n' + id;
    },
    label: function (s) {
      return String(s)
        .replace(/\s+/g, ' ')
        .replace(/[#";:<>{}[\]|]/g, function (c) { return '#' + c.charCodeAt(0) + ';'; })
        .trim();
    },
  };
})();
