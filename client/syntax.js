(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});

  function words(text) {
    var set = Object.create(null);
    text.split(' ').forEach(function (w) { if (w) set[w] = true; });
    return set;
  }

  var C_LITERALS = 'true false null nil undefined NaN Infinity None True False iota this self super';
  var LANGS = {
    go: {
      kw: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
      ty: words('string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr bool byte rune error any float32 float64 complex64 complex128'),
      line: '//', block: ['/*', '*/'], quotes: '"\'`',
    },
    js: {
      kw: words('async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static switch throw try typeof var void while with yield as type interface enum implements private protected public readonly declare namespace abstract keyof satisfies'),
      ty: words('string number boolean bigint symbol object unknown never any void Promise Array Map Set Record'),
      line: '//', block: ['/*', '*/'], quotes: '"\'`',
    },
    py: {
      kw: words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
      ty: words('int float str bool bytes list dict set tuple object type'),
      line: '#', block: null, quotes: '"\'', triple: true,
    },
    java: {
      kw: words('abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized throw throws transient try volatile while var val fun object when is in out override open sealed data lazy def trait match with yield given using extension inline suspend companion internal'),
      ty: words('int long short byte char boolean float double void String Int Long Boolean Double Float Unit Any Option List Map Set Seq Future'),
      line: '//', block: ['/*', '*/'], quotes: '"\'', triple: true,
    },
    php: {
      kw: words('abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while yield'),
      ty: words('int float string bool array object mixed void never iterable self static'),
      line: '//', block: ['/*', '*/'], quotes: '"\'',
    },
    c: {
      kw: words('auto break case catch class const constexpr continue default delete do else enum explicit extern for friend goto if inline let loop match mod move mut namespace new operator private protected pub public return sizeof static struct switch template throw trait try typedef typename union unsafe use using virtual volatile where while fn impl crate as async await dyn ref'),
      ty: words('int long short char float double void bool unsigned signed size_t i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 usize isize str String Vec Option Result Self'),
      line: '//', block: ['/*', '*/'], quotes: '"\'',
    },
    sh: {
      kw: words('if then else elif fi for while until do done case esac in function return local export select'),
      ty: words(''),
      line: '#', block: null, quotes: '"\'',
    },
    plain: { kw: words(''), ty: words(''), line: null, block: null, quotes: '' },
  };
  var LITERALS = words(C_LITERALS);

  var BY_EXT = {
    go: 'go',
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js', vue: 'js',
    py: 'py', pyi: 'py', rb: 'py',
    java: 'java', kt: 'java', kts: 'java', scala: 'java', sc: 'java', groovy: 'java', gradle: 'java', swift: 'java', cs: 'java', dart: 'java',
    php: 'php',
    c: 'c', h: 'c', cc: 'c', cpp: 'c', hpp: 'c', cxx: 'c', rs: 'c', m: 'c', zig: 'c',
    sh: 'sh', bash: 'sh', zsh: 'sh', yml: 'sh', yaml: 'sh', toml: 'sh', tf: 'sh', dockerfile: 'sh', mk: 'sh',
  };

  function langOf(path) {
    var name = String(path || '').split('/').pop().toLowerCase();
    if (name === 'dockerfile' || name === 'makefile') return LANGS.sh;
    var dot = name.lastIndexOf('.');
    return LANGS[BY_EXT[dot < 0 ? '' : name.slice(dot + 1)]] || LANGS.plain;
  }

  function isWordStart(ch) { return /[A-Za-z_$]/.test(ch); }
  function isWord(ch) { return /[A-Za-z0-9_$]/.test(ch); }

  // One line into [{ t, k }] tokens (k: kw, str, com, num, ty, fn, or '' for plain text).
  // `state.com` carries an open block comment, `state.str` an open multi-line string, across lines.
  function tokens(line, lang, state) {
    var out = [];
    function push(t, k) {
      if (!t) return;
      var last = out[out.length - 1];
      if (last && last.k === k) last.t += t;
      else out.push({ t: t, k: k });
    }
    var i = 0;
    var n = line.length;
    if (state.com) {
      var close = line.indexOf(lang.block[1]);
      if (close < 0) { push(line, 'com'); return out; }
      push(line.slice(0, close + lang.block[1].length), 'com');
      i = close + lang.block[1].length;
      state.com = false;
    }
    if (state.str) {
      var endQ = line.indexOf(state.str);
      if (endQ < 0) { push(line, 'str'); return out; }
      push(line.slice(0, endQ + state.str.length), 'str');
      i = endQ + state.str.length;
      state.str = null;
    }
    while (i < n) {
      var ch = line[i];
      if (lang.line && line.startsWith(lang.line, i) && !(lang === LANGS.sh && i > 0 && /\S/.test(line[i - 1]))) {
        push(line.slice(i), 'com');
        break;
      }
      if (lang.block && line.startsWith(lang.block[0], i)) {
        var end = line.indexOf(lang.block[1], i + lang.block[0].length);
        if (end < 0) { push(line.slice(i), 'com'); state.com = true; break; }
        push(line.slice(i, end + lang.block[1].length), 'com');
        i = end + lang.block[1].length;
        continue;
      }
      if (lang.triple && (line.startsWith('"""', i) || (lang === LANGS.py && line.startsWith("'''", i)))) {
        var triple = line.substr(i, 3);
        var tEnd = line.indexOf(triple, i + 3);
        if (tEnd < 0) { push(line.slice(i), 'str'); state.str = triple; break; }
        push(line.slice(i, tEnd + 3), 'str');
        i = tEnd + 3;
        continue;
      }
      // A shell / YAML apostrophe inside a word (don't) and a Rust lifetime ('a) are not strings.
      var apostrophe = ch === "'" && (
        (lang === LANGS.sh && i > 0 && !/[\s=:(\[{,]/.test(line[i - 1]))
        || (lang === LANGS.c && /^'[A-Za-z_]\w*(?!')/.test(line.slice(i)) && line[i + 2] !== "'")
      );
      if (lang.quotes.indexOf(ch) >= 0 && !apostrophe) {
        var j = i + 1;
        while (j < n && line[j] !== ch) j += line[j] === '\\' && ch !== '`' ? 2 : 1;
        if (j >= n && ch === '`') { push(line.slice(i), 'str'); state.str = '`'; break; }
        push(line.slice(i, Math.min(n, j + 1)), 'str');
        i = Math.min(n, j + 1);
        continue;
      }
      if (/[0-9]/.test(ch) && !(i > 0 && isWord(line[i - 1]))) {
        var k = i + 1;
        while (k < n && /[0-9a-fA-FxXoObB_.]/.test(line[k])) k++;
        push(line.slice(i, k), 'num');
        i = k;
        continue;
      }
      if (isWordStart(ch)) {
        var w = i + 1;
        while (w < n && isWord(line[w])) w++;
        var word = line.slice(i, w);
        var rest = line.slice(w).match(/^\s*\(/);
        var kind = lang.kw[word] ? 'kw'
          : LITERALS[word] && lang !== LANGS.plain ? 'num'
            : lang.ty[word] ? 'ty'
              : rest && lang !== LANGS.plain ? 'fn'
                : /^[A-Z][a-z0-9]/.test(word) && lang !== LANGS.plain ? 'ty'
                  : '';
        push(word, kind);
        i = w;
        continue;
      }
      push(ch, '');
      i++;
    }
    return out;
  }

  function highlight(lines, path) {
    var lang = langOf(path);
    var state = { com: false, str: null };
    return lines.map(function (line) {
      return tokens(line.replace(/\t/g, '    '), lang, state).map(function (tok) {
        return tok.k ? vs.el('span', { class: 'vs-syn-' + tok.k }, tok.t) : document.createTextNode(tok.t);
      });
    });
  }

  vs.syntax = { tokens: function (line, path) { return tokens(line, langOf(path), { com: false, str: null }); }, highlight: highlight };
})();
