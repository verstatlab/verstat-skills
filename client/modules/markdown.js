(function () {
  'use strict';
  var vs = (window.verstat = window.verstat || {});

  var FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  var HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
  var HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  var QUOTE = /^ {0,3}> ?(.*)$/;
  var ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
  var TABLE_SEP = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;
  var SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

  function blank(line) {
    return line.trim() === '';
  }

  function cells(line) {
    var s = line.trim().replace(/^\|/, '').replace(/(^|[^\\])\|$/, '$1');
    var out = [];
    var cur = '';
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '\\' && s[i + 1] === '|') {
        cur += '|';
        i++;
      } else if (s[i] === '|') {
        out.push(cur.trim());
        cur = '';
      } else cur += s[i];
    }
    out.push(cur.trim());
    return out;
  }

  function isTable(lines, i) {
    return i + 1 < lines.length && lines[i].indexOf('|') >= 0 && lines[i + 1].indexOf('-') >= 0 && TABLE_SEP.test(lines[i + 1]);
  }

  function starts(lines, i) {
    var line = lines[i];
    return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || ITEM.test(line) || isTable(lines, i);
  }

  // Line ranges are 1-based.
  function parse(lines) {
    var blocks = [];
    var i = 0;
    var n = lines.length;
    while (i < n) {
      var line = lines[i];
      var m;
      if (blank(line)) {
        i++;
        continue;
      }
      if ((m = line.match(FENCE))) {
        var mark = m[1];
        var rows = [];
        var j = i + 1;
        while (j < n && !(lines[j].trim().indexOf(mark[0].repeat(mark.length)) === 0 && /^ {0,3}[`~]+\s*$/.test(lines[j]))) {
          rows.push({ line: j + 1, text: lines[j] });
          j++;
        }
        blocks.push({ type: 'code', lang: m[2].trim().split(/\s+/)[0] || '', start: i + 1, end: Math.min(j + 1, n), rows: rows });
        i = j + 1;
        continue;
      }
      if ((m = line.match(HEADING))) {
        blocks.push({ type: 'h' + Math.min(4, m[1].length), text: m[2] || '', start: i + 1, end: i + 1 });
        i++;
        continue;
      }
      if (HR.test(line)) {
        blocks.push({ type: 'hr', start: i + 1, end: i + 1 });
        i++;
        continue;
      }
      if (isTable(lines, i)) {
        var trows = [{ line: i + 1, cells: cells(line), head: true }];
        var k = i + 2;
        while (k < n && !blank(lines[k]) && lines[k].indexOf('|') >= 0) {
          trows.push({ line: k + 1, cells: cells(lines[k]) });
          k++;
        }
        blocks.push({ type: 'table', start: i + 1, end: k, rows: trows });
        i = k;
        continue;
      }
      if (QUOTE.test(line)) {
        var parts = [];
        var q = i;
        while (q < n && (m = lines[q].match(QUOTE))) {
          parts.push(m[1]);
          q++;
        }
        blocks.push({ type: 'quote', text: parts.join(' ').trim(), start: i + 1, end: q });
        i = q;
        continue;
      }
      if ((m = line.match(ITEM))) {
        var indent = m[1].replace(/\t/g, '  ').length;
        var text = [m[3]];
        var e = i + 1;
        while (e < n && !blank(lines[e]) && !ITEM.test(lines[e]) && !starts(lines, e)) {
          text.push(lines[e].trim());
          e++;
        }
        var ordered = /\d/.test(m[2]);
        blocks.push({
          type: ordered ? 'oli' : 'li',
          num: ordered ? m[2].slice(0, -1) : null,
          depth: Math.min(3, Math.floor(indent / 2)),
          text: text.join(' ').trim(),
          start: i + 1,
          end: e,
        });
        i = e;
        continue;
      }
      var para = [line.trim()];
      var p = i + 1;
      var setext = null;
      while (p < n && !blank(lines[p])) {
        if ((m = lines[p].match(SETEXT))) {
          setext = m[1][0] === '=' ? 'h1' : 'h2';
          p++;
          break;
        }
        if (starts(lines, p)) break;
        para.push(lines[p].trim());
        p++;
      }
      blocks.push({ type: setext || 'p', text: para.join(' '), start: i + 1, end: p });
      i = p;
    }
    return blocks;
  }

  function byLine(blocks) {
    var at = {};
    blocks.forEach(function (b) {
      for (var l = b.start; l <= b.end; l++) at[l] = b;
    });
    return at;
  }

  function rowOf(block, line) {
    for (var i = 0; i < block.rows.length; i++) if (block.rows[i].line === line) return block.rows[i];
    return null;
  }

  function fragment(oldLines, newLines, hunkLines) {
    var oldBlocks = oldLines ? parse(oldLines) : [];
    var newBlocks = newLines ? parse(newLines) : [];
    var at = { old: byLine(oldBlocks), now: byLine(newBlocks) };
    var items = [];
    var seen = {};
    var rowItem = null;
    var oldToNew = {};
    var removed = [];
    hunkLines.forEach(function (l) {
      if (l.kind === 'context') oldToNew[l.old] = l.new;
    });
    hunkLines.forEach(function (l) {
      var side = l.kind === 'del' ? 'old' : 'now';
      var line = side === 'old' ? l.old : l.new;
      var block = at[side][line];
      if (!block) {
        if (!blank(l.text)) rowItem = null;
        return;
      }
      var sign = l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ';
      if (block.rows) {
        var row = rowOf(block, line);
        if (!row) return;
        if (!rowItem || rowItem.type !== block.type || (rowItem.side === side && rowItem.last !== block)) {
          rowItem = { type: block.type, lang: block.lang, start: block.start, sign: ' ', rows: [], blocks: [] };
          items.push(rowItem);
        }
        rowItem.side = side;
        rowItem.last = block;
        if (rowItem.blocks.indexOf(block) < 0) rowItem.blocks.push(block);
        rowItem.rows.push({ sign: sign, line: line, text: row.text, cells: row.cells, head: row.head });
        if (sign !== ' ') rowItem.sign = '~';
        return;
      }
      rowItem = null;
      var key = side + ':' + block.start;
      if (seen[key]) {
        if (sign === '+') seen[key].sign = '+';
        return;
      }
      var item = { type: block.type, text: block.text, num: block.num, depth: block.depth, start: block.start, line: block.start, sign: sign };
      seen[key] = item;
      items.push(item);
      if (sign === '-') removed.push(block);
    });
    removed.forEach(function (block) {
      for (var l = block.start; l <= block.end; l++) {
        var nb = oldToNew[l] && at.now[oldToNew[l]];
        var twin = nb && seen['now:' + nb.start];
        if (twin && twin.sign === ' ') twin.sign = '+';
      }
    });

    items.forEach(function (item) {
      if (item.type !== 'table') return;
      var hasHead = item.rows.some(function (r) { return r.head; });
      if (hasHead) return;
      var source = item.blocks[0];
      var head = source.rows[0];
      item.rows.unshift({ sign: ' ', line: head.line, cells: head.cells, head: true, filled: true });
    });

    var ordered = [];
    var run = [];
    function flush() {
      run.sort(function (a, b) { return (a.sign === '-' ? 0 : 1) - (b.sign === '-' ? 0 : 1); });
      ordered.push.apply(ordered, run);
      run = [];
    }
    items.forEach(function (item) {
      if (item.sign === '-' || item.sign === '+') run.push(item);
      else {
        flush();
        ordered.push(item);
      }
    });
    flush();

    var first = ordered[0];
    if (first && !/^h[1-4]$/.test(first.type)) {
      var fromOld = first.sign === '-' && !hunkLines.some(function (l) { return l.kind !== 'del'; });
      var pool = fromOld ? oldBlocks : newBlocks;
      var startLine = fromOld ? first.start : firstNewLine(hunkLines);
      var heading = null;
      pool.forEach(function (b) {
        if (/^h[1-4]$/.test(b.type) && b.start < startLine) heading = b;
      });
      if (heading) ordered.unshift({ type: heading.type, text: heading.text, start: heading.start, line: heading.start, sign: ' ', section: true });
    }
    return ordered;
  }

  function firstNewLine(hunkLines) {
    for (var i = 0; i < hunkLines.length; i++) if (hunkLines[i].new !== undefined) return hunkLines[i].new;
    return Infinity;
  }

  function inline(text, style) {
    var out = [];
    var base = style || {};
    var re = /(`+)([\s\S]*?[^`])\1(?!`)|(\*\*|__)(?=\S)([\s\S]*?\S)\3|(\*|_)(?=\S)([\s\S]*?\S)\5(?![\w*])|!?\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)|<(https?:\/\/[^>\s]+)>/g;
    var i = 0;
    var m;
    function push(t, extra) {
      if (t === '') return;
      var run = { t: t };
      for (var k in base) run[k] = base[k];
      for (var e in extra || {}) run[e] = extra[e];
      out.push(run);
    }
    while ((m = re.exec(text))) {
      if (m[5] === '_' && /\w/.test(text[m.index - 1] || '')) {
        re.lastIndex = m.index + 1;
        continue;
      }
      if (m.index > i) push(text.slice(i, m.index).replace(/\\([\\`*_[\]()#+\-.!|])/g, '$1'));
      if (m[1]) push(m[2].trim() || m[2], { code: true });
      else if (m[3]) out.push.apply(out, inline(m[4], merge(base, { b: true })));
      else if (m[5]) out.push.apply(out, inline(m[6], merge(base, { i: true })));
      else if (m[0][0] === '!') push(m[7]);
      else if (m[0][0] === '[') out.push.apply(out, inline(m[7], merge(base, /^https?:\/\//.test(m[8]) ? { href: m[8] } : { link: true })));
      else push(m[9], { href: m[9] });
      i = re.lastIndex;
    }
    if (i < text.length) push(text.slice(i).replace(/\\([\\`*_[\]()#+\-.!|])/g, '$1'));
    return out;
  }

  function merge(a, b) {
    var o = {};
    for (var k in a) o[k] = a[k];
    for (var j in b) o[j] = b[j];
    return o;
  }

  vs.markdown = { parse: parse, fragment: fragment, inline: inline };
})();
