import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { ROOT } from './helpers.mjs';

const window = { verstat: { el: (tag, attrs, t) => ({ k: attrs.class.replace('vs-syn-', ''), t }) } };
const document = { createTextNode: (t) => ({ k: '', t }) };
runInNewContext(readFileSync(join(ROOT, 'client', 'syntax.js'), 'utf8'), { window, document });
const { syntax } = window.verstat;
const plain = (v) => JSON.parse(JSON.stringify(v));

function kinds(line, path) {
  return plain(syntax.tokens(line, path).filter((t) => t.k).map((t) => [t.k, t.t]));
}

function lines(text, path) {
  return plain(syntax.highlight(text.split('\n'), path).map((nodes) => nodes.filter((n) => n.k).map((n) => [n.k, n.t])));
}

describe('syntax', () => {
  test('colours Go keywords, types, calls, strings, numbers and comments', () => {
    assert.deepEqual(kinds('func f(n int) error { return fmt.Errorf("x %d", 42) } // done', 'a/b.go'), [
      ['kw', 'func'], ['fn', 'f'], ['ty', 'int'], ['ty', 'error'], ['kw', 'return'], ['fn', 'Errorf'], ['str', '"x %d"'], ['num', '42'], ['com', '// done'],
    ]);
  });

  test('an unknown extension stays plain', () => {
    assert.deepEqual(kinds('if (x) return "y"; // z', 'notes.txt'), []);
  });

  test('block comments and multi-line strings carry over between lines', () => {
    assert.deepEqual(lines('a /* one\ntwo\nthree */ b', 'x.js'), [[['com', '/* one']], [['com', 'two']], [['com', 'three */']]]);
    assert.deepEqual(lines('s := `raw\nstill raw` + x', 'x.go'), [[['str', '`raw']], [['str', 'still raw`']]]);
    assert.deepEqual(lines('d = """doc\nmore"""', 'x.py'), [[['str', '"""doc']], [['str', 'more"""']]]);
    assert.deepEqual(lines("val q = \"\"\"\nWHERE a = 'x' // not a comment\n\"\"\"", 'Repo.kt'), [[['kw', 'val'], ['str', '"""']], [['str', "WHERE a = 'x' // not a comment"]], [['str', '"""']]]);
  });

  test('a shell or YAML # comment needs a space before it; an apostrophe in a word is not a string', () => {
    assert.deepEqual(kinds("description: don't use it  # note", 'ci.yml'), [['com', '# note']]);
    assert.deepEqual(kinds('url=a#b', 'run.sh'), []);
  });

  test('a Rust lifetime is not a string, a char literal is', () => {
    assert.deepEqual(kinds("fn f<'a>(x: &'a str) -> char { 'z' }", 'lib.rs'), [['kw', 'fn'], ['ty', 'str'], ['ty', 'char'], ['str', "'z'"]]);
  });
});
