(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});
  var tag = document.getElementById('verstat-strings');
  var data = tag ? JSON.parse(tag.textContent) : {};
  var dicts = [];
  if (data.strings) dicts.push({ lang: data.ui || 'en', strings: data.strings });
  if (data.en) dicts.push({ lang: 'en', strings: data.en });
  var rules = {};

  function form(value, lang, n) {
    if (typeof value === 'string') return value;
    if (typeof n !== 'number' || typeof Intl === 'undefined' || !Intl.PluralRules) return value.other;
    if (!rules[lang]) rules[lang] = new Intl.PluralRules(lang);
    var cat = rules[lang].select(n);
    return value[cat] !== undefined ? value[cat] : value.other;
  }

  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, function (all, name) {
      return vars && vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : all;
    });
  }

  function t(key, vars, fallback) {
    for (var i = 0; i < dicts.length; i++) {
      var value = dicts[i].strings[key];
      if (value !== undefined && value !== null) {
        var text = form(value, dicts[i].lang, vars && vars.n);
        if (text !== undefined) return fill(text, vars);
      }
    }
    return fallback !== undefined && fallback !== null ? fill(fallback, vars) : key;
  }

  function plural(n, key, vars) {
    var all = { n: n };
    Object.keys(vars || {}).forEach(function (k) { all[k] = vars[k]; });
    return t(key, all);
  }

  vs.lang = data.lang || 'en';
  vs.t = t;
  vs.plural = plural;
  vs.label = function (type, meta) {
    return t(type + '.label', null, (meta && meta.label) || type);
  };
})();
