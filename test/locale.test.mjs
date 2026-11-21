import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CLIENT_STRINGS, pageStrings } from '../src/build.mjs';
import { ROOT, i18n, makeRepo, notePage, run, tempDir, writePage } from './helpers.mjs';

const en = JSON.parse(readFileSync(join(ROOT, 'locales', 'en.json'), 'utf8'));
const uk = JSON.parse(readFileSync(join(ROOT, 'locales', 'uk.json'), 'utf8'));

function build(page) {
  const out = join(tempDir('verstat-locale-'), 'page.html');
  const r = run(['build', writePage(page), '-o', out]);
  return { ...r, html: existsSync(out) ? readFileSync(out, 'utf8') : null };
}

function stringsOf(html) {
  return JSON.parse(html.match(/<script type="application\/json" id="verstat-strings">(.*?)<\/script>/s)[1]);
}

function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) walk(path);
      else if (name.name.endsWith('.js')) files.push(path);
    }
  };
  walk(join(ROOT, 'client'));
  walk(join(ROOT, 'components'));
  return files;
}

describe('page language', () => {
  const repo = makeRepo();

  test('a page without lang gets the English UI and <html lang="en">', () => {
    const r = build(notePage(repo));
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.html, /<html lang="en">/);
    const s = stringsOf(r.html);
    assert.equal(s.ui, 'en');
    assert.equal(s.strings['core.expand'], 'expand');
    assert.equal(s.en, undefined);
  });

  test('lang "uk" gets the Ukrainian UI with English as the fallback', () => {
    const r = build({ ...notePage(repo), lang: 'uk' });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.html, /<html lang="uk">/);
    const s = stringsOf(r.html);
    assert.equal(s.ui, 'uk');
    assert.equal(s.strings['core.expand'], 'розгорнути');
    assert.equal(s.en['core.expand'], 'expand');
  });

  test('a regional tag falls back to its base language', () => {
    const s = stringsOf(build({ ...notePage(repo), lang: 'uk-UA' }).html);
    assert.equal(s.lang, 'uk-UA');
    assert.equal(s.ui, 'uk');
  });

  test('a language with no dictionary gets the English UI and keeps its <html lang>', () => {
    const r = build({ ...notePage(repo), lang: 'de' });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.html, /<html lang="de">/);
    const s = stringsOf(r.html);
    assert.equal(s.ui, 'en');
    assert.equal(s.strings['core.expand'], 'expand');
  });

  test('only the client strings and the page block types are embedded', () => {
    const s = stringsOf(build(notePage(repo)).html);
    assert.ok(Object.keys(s.strings).every((k) => CLIENT_STRINGS.includes(k.split('.')[0])));
  });

  test('the strings of the page block types are embedded, others are not', () => {
    const s = pageStrings(ROOT, 'uk', ['risks']);
    assert.equal(s.strings['risks.severity.high'], 'високий');
    assert.equal(s.en['risks.severity.high'], 'high');
    assert.equal(s.strings['core.expand'], 'розгорнути');
    assert.equal(s.strings['changes.binary'], undefined);
    assert.equal(s.en['changes.binary'], undefined);
  });

  test('the schema rejects a lang that is not a language tag', () => {
    const r = run(['validate', writePage({ ...notePage(repo), lang: 'Ukrainian' })]);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /lang/);
  });
});

describe('UI dictionaries', () => {
  const locales = readdirSync(join(ROOT, 'locales')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

  test('every locale has the keys of en.json', () => {
    assert.ok(locales.includes('uk'));
    for (const lang of locales) {
      const dict = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
      assert.deepEqual(Object.keys(dict).sort(), Object.keys(en).sort(), lang);
    }
  });

  test('plural values use the categories of their language', () => {
    for (const lang of locales) {
      const dict = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
      const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories.slice().sort();
      for (const [key, value] of Object.entries(dict)) {
        assert.equal(typeof value, typeof en[key], `${lang}: ${key}`);
        if (typeof value === 'object') assert.deepEqual(Object.keys(value).sort(), categories, `${lang}: ${key}`);
      }
    }
  });

  test('component labels match their meta.json', () => {
    for (const type of readdirSync(join(ROOT, 'components'))) {
      const meta = JSON.parse(readFileSync(join(ROOT, 'components', type, 'meta.json'), 'utf8'));
      assert.equal(en[`${type}.label`], meta.label, type);
      assert.ok(uk[`${type}.label`], type);
    }
  });

  test('every key the client and the components look up exists in en.json', () => {
    const namespaces = [...CLIENT_STRINGS, ...readdirSync(join(ROOT, 'components'))];
    const literal = new RegExp(`(['\`])((?:${namespaces.join('|')})\\.[\\w.\${}-]*)\\1`, 'g');
    const keys = Object.keys(en);
    let seen = 0;
    for (const file of sourceFiles()) {
      for (const m of readFileSync(file, 'utf8').matchAll(literal)) {
        const key = m[2];
        seen++;
        const prefix = key.includes('${') ? key.split('${')[0] : key.endsWith('.') ? key : null;
        if (prefix) assert.ok(keys.some((k) => k.startsWith(prefix)), `${file}: no key starts with ${prefix}`);
        else assert.ok(key in en, `${file}: ${key} is not in locales/en.json`);
      }
    }
    assert.ok(seen > 200, `only ${seen} keys found`);
  });
});

describe('string lookup', () => {
  test('uk plural forms follow 1 / 2 / 5 / 11 / 21', () => {
    const { plural } = i18n('uk');
    assert.deepEqual([1, 2, 5, 11, 21].map((n) => plural(n, 'hotspots.lines')), ['1 рядок', '2 рядки', '5 рядків', '11 рядків', '21 рядок']);
  });

  test('en plural forms are one and other', () => {
    const { plural } = i18n('en');
    assert.deepEqual([0, 1, 2].map((n) => plural(n, 'hotspots.lines')), ['0 lines', '1 line', '2 lines']);
    assert.equal(plural(3, 'read.progress', { read: 1 }), 'Read 1 of 3 files');
  });

  test('a missing key falls back to the given text, then to the key itself', () => {
    const { t } = i18n('de');
    assert.equal(t('core.expand'), 'expand');
    assert.equal(t('nope.key', null, 'Fallback {x}'), 'Fallback {x}');
    assert.equal(t('nope.key', { x: 1 }, 'Fallback {x}'), 'Fallback 1');
    assert.equal(t('nope.key'), 'nope.key');
    assert.equal(t('route.stepOf', { at: 2, total: 5 }), 'step 2 of 5');
  });
});
