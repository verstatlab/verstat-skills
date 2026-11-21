# Engine

`bin/verstat.mjs` checks a page and builds it into one HTML file. It is a single file with no
dependencies, committed already built, and runs on Node 18 or newer and on Deno
(`deno run -A bin/verstat.mjs …`). Nothing needs to be installed.

```bash
node bin/verstat.mjs schema <type>                 # a block type's JSON Schema, for the agent to follow
node bin/verstat.mjs schema page                   # the page schema (verstat.page/1)
node bin/verstat.mjs validate page.json [--json]   # check the page against its schemas and repos
node bin/verstat.mjs build page.json -o page.html  # validate, then write one offline HTML file
node bin/verstat.mjs facts diff <base>..<head> [--dir <checkout>]   # what a diff holds, as JSON
```

Options, before or after the command:

- `--components <dir>`: an extra folder of block types, searched before the plugin's
  `components/`. Can be repeated. The tests use it for `test/fixtures/components/`.
- `--repo <name>=<dir>`: where the local checkout of a repo from the page's `repos` lives.
- `--dir <checkout>`: the repo `facts` reads; the current directory by default. Only for `facts`,
  which takes no other option.

Exit codes: `0` ok; `1` the page is invalid or the build failed (an unknown block type in a page
is a page error); `2` usage error, including `schema` of an unknown type. `validate` prints `ok`
and then one `inferred: <path> — <reason>` line per claim whose content check failed. Errors go to stderr, one `error: <json path>: <message>` line per problem,
and every problem is reported, not only the first. `--json` prints `{ ok, errors, inferred }`.
`build` writes its output only when the page is valid; a failed build leaves any earlier output
file as it was, so check the exit code rather than whether the file exists.

## Diff facts

`verstat facts diff <base>..<head>` reads a diff with git and prints JSON for the agent writing an
`explain-pr` page. It only prints: it never writes a page or touches the checkout. `<base>...<head>`
(three dots) diffs from their merge base. A range that is not `A..B` / `A...B`, an unknown revision
or a folder that is not a git repo is a usage error (exit `2`, nothing on stdout); a git call that
fails after that (a partial clone missing a blob, say) is exit `1`. Git runs with the
same overrides as anchor reads (see **Trust** below), plus `diff.interHunkContext=0` and
`diff.relative=false`, so a user's diff settings cannot change what it reads.

```
{ range, base, head,            full shas
  files:   [{ path, status: added|deleted|modified, additions, deletions, binary? }],
  commits: [{ sha, short, parents: [sha], subject, additions, deletions, files: [path], external? }],   oldest first
  moved:   [ moved-code items ],
  noise:   [ noise items ],
  totals:  { additions, deletions, moved, noise } }
```

`totals.moved` is the sum of the moved items' `lines`, each moved line counted once (it is both
removed and added, so it accounts for twice that many of `additions + deletions`);
`totals.noise` is the sum of the noise items' `lines`, which count removed and added lines
separately.

`commits` come from `git log --topo-order --reverse <base>..<head>`, so a parent is always listed
before its children. `parents` are the full shas of each commit's parents (two or more for a merge).
A merge in the range whose second (or later) parent is outside the range — the base branch merged
into the PR branch — brings that parent in as an extra entry right before the merge, with
`external: true`, its subject and parents, `0` additions and deletions and no files: it is a node of
the graph, not part of the diff, so do not count it in the brief's `commits`.

`commits` is not in the `commits` block's item shape: for the block, give each one an `id`, use
`subject` as `message`, add the `intent`, and leave `short` out (the block shortens the sha
itself); keep `parents` and `external`, which draw the graph. `moved` and `noise` are already in the item shape of the `moved-code` and `noise` blocks, so the
agent pastes them into the page and may rewrite the titles. Renames are not followed: a renamed
file is a deleted file plus an added one, and its content shows up as a moved item.

- **Moved**: a run of removed lines that appears again as a run of added lines elsewhere in the
  diff. Lines compare with leading and trailing whitespace trimmed, so re-indented code still
  counts. The match starts on a line longer than two characters (not a lone `}`), holds at least
  three lines with content: longer than two characters and not only closers (`});`, `end`,
  `fi`, `done`, `esac`, `</div>`), which ride along inside a match but neither start nor count; the
  longest match is taken first, each line used once. A removed and
  an added run in the same hunk are an edit, not a move. Item: `{ id: "moved-<n>", title (the first
  moved line, at most 80 characters), from: { path, start, end }, to: { path, start, end }, lines,
  body }`, with old line numbers in `from`, new ones in `to`, and `body` the code at head (at most
  60 lines, then `…`).
- **Generated**: every line of a lock file (`package-lock.json`, `npm-shrinkwrap.json`,
  `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`, `composer.lock`, `poetry.lock`,
  `Gemfile.lock`). These take no part in the other checks.
- **Whitespace**, only in modified files and among lines not moved: a removed and an added line of
  the same hunk that are equal once leading and trailing whitespace is trimmed (a re-indent),
  paired in order so that lines that swapped places stay a real change, and
  blank lines in a hunk that changes nothing else. A change of whitespace inside a line, which may
  sit in a string, is a real change. Where indentation is syntax (`.py`, `.yaml` / `.yml`,
  `Makefile`, `.haml`, `.pug` / `.jade`, `.slim`, `.coffee`, `.md` / `.markdown`, `.rst`, `.hs`,
  `.elm`, `.fs`, `.nim`, `.sass`, `.styl`) only trailing whitespace may differ, so a line
  moved into or out of a block stays a real change, and blank lines are content, not noise.
- **Imports**, only in modified files and among lines left over: lines that look like an import for
  the file's language: `import` (not `import(…)` or `import.meta`), a re-export (`export * from`, `export { … } from`)
  and `require(…)` in JS and TS, `import` and
  `from … import` in Python, `import` in Java, Kotlin and Scala, `import "…"` and the `"path"` lines
  inside an `import ( … )` group in Go (the file is read at base and head to find the group), a
  top-level `use …;` in PHP (an indented one is a trait), `use …;` in Rust, `#include` in C and
  C++, `#import` / `@import` in Objective-C. An import wrapped over several lines (JS / TS
  `import {` … `} from '…'`, Python
  `from x import (` … `)`) counts whole when its first and closing lines are in the same run of changed lines; a local
  `export {` … `};` list is not an import.

Noise items are one per kind that has lines: `{ id: "noise-<kind>", kind, title (“Imports”,
“Whitespace and formatting”, “Generated files”), paths, lines, body }`, where `lines` counts the
changed lines (removed and added) and `body` lists them as `+ …` / `- …` under a line per path (at
most 60 lines, then `…`). A line in no item is a real change.

The same reading is used inside the engine (`diffLines`, not a command): the file list, the moved
items and the noise items of a `<base>..<head>` pair, with every changed line marked as moved,
noise or real. `facts diff` prints exactly what it did before.

## Changes

A `changes` block is one **layer** of the change: the agent splits the code of the PR (without
noise, tests and documentation) into layers in reading order, one block per layer, one route step
each. A block names a head repo (`repo`) and a base repo (`base`) of `repos`; during `validate` and
`build` the engine diffs `base`'s sha against `repo`'s sha in `repo`'s checkout (the base sha must
exist there) and checks the block against the diff. The agent writes the files and, per file, its
**fragments**: `kind` (`read` / `skim` / `skip`), `title`, `description`, `function`, `commit`,
`notes` and `test`. It writes no diff lines.

A fragment's lines come from git. `at` gives its bounds in the file: `find` (and `findEnd`, `nth`)
as in an anchor, on the new version, or on the old one with `side: "base"` (for removed lines).
The fragment takes the lines of the file's diff (three lines of context) whose line on that side is
between the two: a removed line counts at the line that follows it on the new side, an added line
at the line that follows it on the old side. It keeps up to two lines of context on each side. A
fragment without `at` takes the whole diff of the file. `at` is not an anchor: it does not embed the
file.

Rules (each is a validation error):

- a path in a block that the diff does not change; the same path twice in a block; the same path in
  two `changes` blocks of the same `repo` (a file is in one layer);
- **every changed file** of the pair is somewhere: in a `changes` block, in a `doc-changes` block, in
  the `files` of a `test-coverage` block with `mode: "diff"`, or is the file a fragment's `test`
  anchors. A file that is only moved code or noise (as in **Diff facts**) may be left out — a lock
  file is noise (generated); listed, it gets no fragments. A binary file or a file whose change has
  no lines counts as real;
- **every changed line** of a listed file that is neither moved nor noise is in a fragment, and no
  changed line is in two fragments; a fragment with no changed line is an error;
- a note's `at` (same shape, same file) covers only lines of its fragment;
- a fragment's `test.anchor` is required and has a `find` (the test's first line; `findEnd` its
  last), one place, not a list;
- a fragment's `commit` must be a commit of `repo`'s checkout.

The pairs checked are those of the `changes` blocks and, on an `explain-pr` page, every
`<name>` / `<name>@base` of `repos`: an `explain-pr` page whose diff is not empty therefore needs
its layers.

**Contract for `doc-changes`.** The completeness rule counts a file as covered when a block with
`type: "doc-changes"` lists it: the block's `repo` is the head repo (as in `changes`; it may be left
out when the page diffs one repo), and each entry of its `files` is a path or an object with `path`.
Nothing else of that block is read here.

`build` adds to each listed file `diff: { status, additions, deletions, binary?, generated? }`, to
each fragment `diff: { lines: [{ kind: add|del|context|gap, old?, new?, text }], additions,
deletions, truncated?: { shown, total } }` and to each note `line` (the last line of its `at`) and
`side` (`repo` / `base`). A fragment shows at most 400 lines and a block at most 8 000; past the cut
`truncated` says how many were shown, and the lines a note sits on are still shown with two lines
around them, so a note may sit anywhere in its fragment. The lines of a fragment's test come from its anchor: the test
file is embedded whole, like any anchored file. The agent writes none of this: the schema rejects
it in the page.

`test-coverage` with `mode: "diff"` has no `behaviors`: its rows are the `read` and `skim` fragments
of the page's `changes` blocks, each with its `test` or “not covered”. Its `files` lists the test
files the change touches (`{ repo?, path }`, `repo` needed when the page diffs more than one repo);
each must be changed. Without `mode` (or with `explain`) `behaviors` is required and `files` is not
allowed.

## Doc changes

A `doc-changes` block names a head repo (`repo`) and a base repo (`base`) of `repos`, like
`changes`, and lists Markdown files (`.md`, `.markdown`) in `files`. During `validate` and
`build` the engine diffs `base`'s sha against `repo`'s sha in `repo`'s checkout with three lines of
context (`diffHunks`, the same git call as **Diff facts**) and checks the block:

- a path that is not Markdown, that the diff does not change, or that is listed twice is an error;
- a fragment's `find` must occur in a line (added, removed or context) of exactly one hunk of its
  file, and no two fragments may take the same hunk; otherwise an error names the text.

`build` puts into each file `diff: { status, additions, deletions, old, new, hunks: [{ lines: [{
kind: add|del|context, old?, new?, text }] }], large? }` — `old` and `new` are the whole file at base
and head as lines (`null` for an added or deleted file), and the hunks are the lines `git diff -U3`
prints, in its order. A version longer than 4 000 lines is not embedded (`null`, with `large:
true`); the page then shows only the raw diff. Each fragment gets `hunk`, the index of the hunk it
describes. The agent writes none of this: the schema rejects `diff` and `hunk` in the page.

**Which files a page shows.** The paths a `doc-changes` block covers are its `files[].path`, all in
the block's `repo`; a check that every changed file is shown somewhere counts them by block type
(`block.type === "doc-changes"`, `block.repo`, `block.files[].path`).

## Route rules

On every page a block appears in the route at most once, and the `short` steps add up to at most 5
minutes. Both are validation errors.

## Source and build

The engine's source is in `src/` (ES modules, `node:` builtins only). `npm run build` runs
`scripts/bundle.mjs` and writes `bin/verstat.mjs`. Never edit `bin/` by hand: `npm test` fails when
the committed bin is not the bundle of `src/`. The bundler is deliberately small, so the source has
to follow a few rules:

- import only relative modules and `node:` builtins, each import on one line;
- export only with `export function|const|let|class` (no `export { … }`, no default export);
- import from a relative module only as a plain `{ a, b }` list (no `as`, no `* as`, no default);
- no line inside a multi-line template literal may start with `import`, `export`, or a top-level
  `function` / `class` / `const` / `let` / `var`: the bundler works line by line;
- top-level names must be unique across all modules, since they end up in one scope.

`npm test` runs the `node:test` suites in `test/`. The tests create throwaway git repos in the
system temp folder.

## A block type

A block type is a folder; its name is the type (`page` is reserved for the page schema):

```
components/<type>/
  schema.json   JSON Schema of the block; the agent reads it as instructions
  render.js     client render
  meta.json     { "deps": ["dagre"], "modules": ["flow"], "group": "behavior", "diffMode": true }
```

- **schema.json** describes the whole block, including `id`, `type` (as `"const": "<type>"`) and
  `title`. The page schema already requires `id` and `type` on every block. Use
  `"$ref": "verstat:page#/$defs/anchor"` for an anchor and `"$ref": "verstat:page#/$defs/source"`
  for a provenance field; `verstat schema <type>` prints them inlined.
- **render.js** has a single `export default function (block, ctx)` that returns a DOM node, and no
  imports. Code before and after the export runs once when the page loads. The build wraps it as
  `verstat.register("<type>", …)` and includes it only when the page has a block of that type.
  Libraries named in `deps` are globals (`dagre`). Inlined code (render, client, vendor) must not
  contain `</script` or `<!--`, and client CSS must not contain `</style`; the build refuses it.
- **meta.json** `deps` lists libraries from `vendor/vendor.json`; the page loads them in the order
  of `vendor/vendor.json`, whatever order `meta.json` lists them in. A page gets a library only
  when one of its block types asks for it. A library's `.css` files go into the
  page's `<style>` before `client/*.css`; its `.js` files are inlined before the client scripts.
  `modules` lists shared client modules — `client/modules/<name>.js` and an optional
  `<name>.css` — that only some block types need (`flow`, the React Flow wrapper of the three
  diagram blocks). A module's script is inlined after `client/*.js` and before the renders, its
  CSS after `client/*.css`; a page whose blocks do not ask for it carries neither. A module name
  is lower-case letters, digits and `-`; a missing module file fails the build. `group` (`foundation`, `structure`, `behavior`, `data`,
  `reliability`, `changes`) and `label` make the kicker of the block header (“04 · Behavior ·
  State machine”); `label` is the English name, and `locales/<lang>.json` may override it with a
  `<type>.label` key; `diffMode: true` lets the client offer Before / After / Diff; `frame: "bare"`
  means the block draws its own header (the brief does). The build refuses a `meta.json` whose
  `group` / `label` is not a string, `diffMode` not a boolean, or `frame` anything but `"bare"`. The client side of a block type is
  described in [client.md](client.md).

The supported JSON Schema keywords: `type` (including `integer` and arrays of types),
`properties`, `required`, `additionalProperties`, `items`, `minItems`, `maxItems`, `uniqueItems`,
`enum`, `const`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `allOf`, `anyOf`,
`oneOf`, `$ref` (`#/…` inside the same file, `verstat:page#/…` for the shared definitions) and
`$defs`. Other keywords are ignored, so do not rely on them.

## Parts

Any object nested inside a block (not the block itself) that has a string `id` is a part: a
state, a transition, a row, a step. Part ids must be unique within their block. A route step's
`focus` must name a part of the step's `block`.

## Anchors: the `x-anchor` keyword family

An anchor points into `path` of `repo`, read at the `sha` that `repos.<repo>` pins. It has one of
four shapes; a chip shows one anchor, whatever its shape.

| Shape | JSON | Lines |
|---|---|---|
| file | `{ "repo", "path" }` | none: the whole file |
| line | `{ "repo", "path", "find", "nth"? }` | where `find` occurs |
| range | `{ "repo", "path", "find", "nth"?, "findEnd" }` | from the first line of `find` to the last line of the first `findEnd` after the match of `find` |
| several places | `{ "repo", "path", "find": [ "<text>", { "find", "nth"? }, … ] }` | each place, at least two |

`nth` and `findEnd` go only with a single `find`; a place of a list takes its own `nth`.

- **`"x-anchor": true`** on a schema node marks the value there as an anchor. The shared
  `verstat:page#/$defs/anchor` already carries it, so every field that `$ref`s it is an anchor. The
  validator collects these marks while it checks the schema (through `$ref`, `items`, and only the
  `oneOf` / `anyOf` branch that matched), so it does not need to know any block type.
- **`"x-anchor-contains": "<field>"`** (or a list of fields), next to an anchor, is a content
  check. The anchored line or lines must contain the text of that sibling field of the object that
  holds the anchor (any one of the listed fields). Example, for a state machine transition:
  `"anchor": { "$ref": "verstat:page#/$defs/anchor", "x-anchor-contains": "to" }`.
  When the text is not on the line, or the field is empty, the page is **not** rejected: the
  object holding the anchor (the claim) is reported as `inferred`, and the build embeds it with
  `"source": "inferred"`, whatever the page said. `source` on an object that holds such an anchor is therefore
  the provenance field (`$ref` it to `verstat:page#/$defs/source`); do not use that name for
  anything else there.

How an anchor resolves:

- The file is read with git at the pinned `sha`, not from the working tree. The `sha` is resolved
  to its full commit id first; a short `sha` that is also a branch or tag name is rejected. The
  built page records the full id.
- `find` is matched as exact text over the whole file and may span lines. Overlapping matches
  count separately. The anchor's line is
  the line where the match starts; `endLine` is where it ends.
- Newlines at the start or end of `find` take part in matching but not in the anchor's line span.
- `nth` counts from **1**. It is required when `find` occurs more than once.
- `findEnd` is searched from the end of the `find` match; the range ends on its last line.
- Each place of a list resolves like a single `find`; overlapping or touching places merge.
- A content check (`x-anchor-contains`) reads every anchored line. A file anchor confirms nothing:
  the claim that holds it is always `inferred`.

The page is rejected when the repo is not in `repos`, the checkout cannot be found, the `sha` is
not a commit there, the file does not exist at the `sha` (for a file anchor too) or is binary (has a NUL byte), a `find` or a
place of a list is not found, occurs more than once without `nth`, or `nth` is past the last
match, `findEnd` does not occur after `find`, or `nth` / `findEnd` stand next to a list or no
`find`. The error names the field: `find`, `find[1]`, `find[1].nth`, `findEnd`.

**Where a checkout is.** `--repo <name>=<dir>` first, then `repos.<name>.path` (absolute, or
relative to the page file), then the page file's own folder. `path` is the one field the engine
adds to the page model: without it, a page could not name a checkout.

**Dirty tree.** A bare repo has no working tree and is not checked; a bare clone is a fine
checkout for the engine. A repo whose working tree has uncommitted changes to tracked files is rejected,
once per repo: its files may no longer be what the agent read at `sha`. Untracked files do not
count, so a page file inside the repo that git does not track does not block it (once the page is
committed, editing it makes the tree dirty like any other tracked file). A tracked file counts as
changed when its bytes differ from the `HEAD` version, so a file that was only touched does not.
The exception is a file whose bytes a checkout filter rewrote, for example line-ending conversion:
once touched, it counts as changed. Files marked assume-unchanged or skip-worktree (or any file
when `core.ignoreStat` is set) are not checked. The check runs `git diff-index`, not `git status`, and
compares raw bytes. It looks at the checkout as it is, whatever `sha` the page pins. The engine
does not compare `HEAD` with `sha`: anchors are always read at `sha`, so a page may pin an older
commit.

**Trust.** The engine runs `git` in every checkout a page points at, and git follows that
checkout's own `.git/config`. Validate a page only against checkouts you trust or made yourself:
for a page from somewhere else, clone the repos yourself and pass them with `--repo <name>=<dir>`.
Variables that redirect git to another repository (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`
and the like, which git hooks set) are removed from the engine's git calls, so validating from a
hook still reads the page's checkouts.
On top of that, every engine git call runs with `core.fsmonitor` off, with every filter driver the
repo configures blanked (`clean`, `smudge`, `process`), with submodules' own state not inspected,
with `GIT_NO_REPLACE_OBJECTS=1`, so `refs/replace` cannot change what a pinned sha reads as,
and with `GIT_NO_LAZY_FETCH=1`, so a partial clone does not fetch from its remote. These overrides
are passed through `GIT_CONFIG_COUNT`, which git 2.31 and newer reads, and the lazy-fetch switch
needs git 2.45. They reduce what a checkout can do; they do not make an untrusted one safe.

## Build output

`client/shell.html` holds four markers, each replaced once:

| Marker | Replaced with |
|---|---|
| `<!--verstat:head-->` | one `@font-face` per vendored font face (woff2 as a `data:` URL), then `client/*.css`, inlined |
| `<!--verstat:data-->` | `<script type="application/json" id="verstat-page">`: the page, plus `code`, `engine` and `validation`; then `<script type="application/json" id="verstat-strings">`: the UI strings (see **Page language**) |
| `<!--verstat:scripts-->` | the vendor libraries the page needs, then `client/*.js` in alphabetical order, then each page type's `render.js` |
| `<!--verstat:licenses-->` | `<script type="text/plain" id="verstat-licenses">` with the licence of each included library and of the fonts; the fonts are on every page, so this block always is too |

In the embedded data every anchor with lines gains `line` and `endLine` (its first span), and
`spans: [[from, to], …]` when it has more than one; a file anchor gains nothing.
`code["<repo>:<path>"]` (repo names may not contain `:`) holds `{ sha, lines }`: the **whole file**,
once per file any anchor points into, so a page grows by the size of the files it anchors; each `changes` file and fragment gains `diff` (see **Changes**).
The page therefore needs no access to the repos. Nothing is loaded from the
network.

`validation` is `{ anchors, inferred }`: how many anchors the validator resolved and how many
claims on the page are `inferred` (declared so, or demoted by a failed content check); the bar
shows it as “verstat validate · N anchors · M inferences”.

Each `render.js` is wrapped as `verstat.register("<type>", fn, meta)`, where `meta` holds the
`group`, `label`, `diffMode` and `frame` fields of the type's `meta.json` (only those present).

## Page language

`lang` in the page is the language its texts are written in, a BCP 47 tag (`en`, `uk`, `pt-BR`);
it defaults to `en`. The build writes it into `<html lang>` and picks the UI dictionary from
`locales/`: `<lang>.json`, else the file of its base language (`uk-UA` → `uk.json`), else
`en.json`. The `verstat-strings` tag holds `{ lang, ui, strings, en }`: `ui` is the language of
`strings`, and `en` (the English dictionary, present only when `ui` is not `en`) is the fallback
for a key `strings` lacks. Only the keys the page can use are embedded: those of the client
(`core`, `group`, `route`, `anchors`, `mermaid`, `flow`, `read`) and of the block types on the
page. The client side is in [client.md](client.md#locales).

## Vendor libraries

`vendor/vendor.json` lists each library: npm package, version, source tarball, the files that
are inlined, and its licence file. `vendor/SHA256SUMS` holds the checksum of every one of those
files, and the build refuses a file that does not match. The files are kept byte for byte as
published. The build drops the `sourceMappingURL` comment while inlining.

To add or update a library: download the pinned tarball, copy the browser build and the licence
text (including the licences of anything bundled inside it) into `vendor/<name>/`, update
`vendor.json`, and regenerate the sums with `cd vendor && shasum -a 256 <files> > SHA256SUMS`.

## Fonts

IBM Plex Sans 400 and 600 and IBM Plex Mono 400 are embedded in every page, subset to Latin,
Cyrillic (with the Ukrainian letter ge) and the punctuation and arrows the pages use. Archivo 800 is
embedded too, for the logo in the bar only, subset to the space, `-`, `.`, `_`, digits and
Latin letters (the logo text and skill names). A font is a
`vendor/vendor.json` entry with `"kind": "font"`: `faces` (`file`, `family`, `weight`, `style`),
`license`, the npm `sources` the faces were cut from, and the `subset` command. Its files are in
`vendor/SHA256SUMS` like a library's, and the build refuses a face that does not match. A font
cannot be named in a block's `deps`.

The faces are cut from the `complete/woff2` files of the pinned `@ibm/plex-sans` and
`@ibm/plex-mono` tarballs (check them against the `integrity` in `vendor.json`), with fonttools,
which is needed only to regenerate them:

```bash
uvx --from 'fonttools[woff]' pyftsubset package/fonts/complete/woff2/IBMPlexSans-Regular.woff2 \
  --unicodes='U+0020-007E,U+00A0-00FF,U+0400-045F,U+0490-0491,U+2010-2027,U+2030-203A,U+2116,U+2190-2193,U+2212' \
  --flavor=woff2 --no-hinting --desubroutinize --layout-features=kern,liga \
  --output-file=vendor/plex/IBMPlexSans-Regular.subset.woff2
```

The same for `IBMPlexSans-SemiBold` and `IBMPlexMono-Regular`. Archivo is cut from the
`files/archivo-latin-800-normal.woff2` of the pinned `@fontsource/archivo` tarball with the
command in its `subset` field.

The three Plex faces are about 45 KB (60 KB as base64), Archivo about 5 KB (6.5 KB as base64)
plus its OFL text. A page with one brief block is about 161 KB (the syntax highlighter is about 8 KB of it); the build
test keeps it under 165 KB.
