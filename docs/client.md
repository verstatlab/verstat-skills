# Client

`client/` is the code every built page shares: the shell, the reading route, code anchors, the
glossary, themes, and the contracts a block's `render.js` builds on. The build inlines
`client/shell.html`, `client/*.css` and `client/*.js` (see [engine.md](engine.md)); the behaviour
is fixed by `docs/design.md` §9.

## Files

| File | What it holds |
|---|---|
| `shell.html` | the page skeleton: `#vs-bar`, `#vs-strip`, `#vs-rail`, `main#verstat-root`, `#vs-footer`, the glossary popover `#vs-term`, `#vs-drawer`, `#vs-toast` |
| `verstat.css` | tokens, typography, layout, chips, popovers, drawer, toast, the `inferred` and diff looks, the foundation blocks |
| `changes.css` | the `explain-pr` change blocks: claimed vs done, the commits graph, the moved-code and noise accordions (code coloured, `+` / `−` lines tinted); the layers of `changes` carry their own CSS in `render.js` |
| `core.js` | `verstat.register`, the block frame, `ctx`, the empty-block rule, bar, footer, theme, toast, clipboard, event bus, start-up |
| `anchors.js` | anchor chips, the file drawer, the block click |
| `glossary.js` | term highlighting and the term popover |
| `route.js` | rail / strip, modes, scroll-spy, focus, collapsing by mode, `#hash` navigation |
| `syntax.js` | `verstat.syntax`: the light syntax highlighter for code lines |
| `diff.js` | the Before / After / Diff switch |
| `modules/flow.js`, `modules/flow.css` | the React Flow wrapper (`verstat.flow`); inlined only with a block that lists `flow` in `meta.json` `modules` (below) |
| `modules/read.js`, `modules/read.css` | the reading progress (`verstat.read`); inlined only with a block that lists `read` in `modules` |
| `modules/commit-graph.js` | `verstat.commitGraph`: the lanes of the commits graph; inlined with `commits` |
| `modules/markdown.js`, `modules/markdown.css` | `verstat.markdown`: Markdown blocks, hunk fragments and inline runs, and the `doc-changes` look; inlined with `doc-changes` |
| `i18n.js` | `verstat.t`, `verstat.plural`, `verstat.label`: the UI strings of the page's language (see **Locales**) |
| `mermaid.js` | “copy as Mermaid” and escaping helpers |

The scripts are plain scripts, not modules, inlined in alphabetical order. Each one adds to one
namespace, `window.verstat`, created by whichever runs first. Nothing runs before
`DOMContentLoaded` except the inline script at the top of `shell.html`, which applies a stored
theme; `core.js` then renders the blocks and starts the other parts in a fixed order. Every
`render.js` is inlined after the client, so `verstat.register` exists when it runs.

Client code is inlined into `<script>` / `<style>`: it may not contain `</script`, `<!--` or
`</style`, and may not name a URL in a `src=` / `href=` attribute (a URL in a string, such as the SVG
namespace passed to `createElementNS`, is fine).

## Page layout

- **Bar**: the Verstat Lab logo — the V mark of five squares (the bottom one in `--vs-accent`)
  as inline SVG, then “VERSTAT LAB” (9px) over the skill name (19px), both in Archivo 800 —
  then `repo@sha` of each repo (repos whose name contains `@`, such as a diff page's
  `orders@base`, are left out), the validation chip (“verstat validate · N anchors · M inferences”),
  the theme button.
- **Route**: a 300px left column (`rail`) from 1280px wide, a sticky top strip below that. A page
  without a route has neither.
- **Blocks** in page order, each in a frame (below), then the **footer**: skill and question,
  `repo@sha` and the engine version, “Contains code (whole files) from <repos>.”
- **Theme**: light and dark, following `prefers-color-scheme` until the reader presses the theme
  button; the choice is then kept in `localStorage` (`verstat.theme`). When storage is not
  available the choice holds for the open page only. The tokens are at the top of `verstat.css`:
  `:root` for light, and the same dark set twice — under `prefers-color-scheme: dark` (unless
  the reader chose light) and under `[data-theme="dark"]`; a test keeps the two dark sets equal.
  The palette is the one in `docs/design.md` §9: the Verstat Lab accent, a muted dark theme,
  grey for removed lines (`--vs-del` means removed code only; error text uses
  `--vs-err`; a problem state in a table, a decision-table conflict included, is
  `.vs-state-problem` in the accent), plus the syntax (`--vs-syn-*`), commit-lane (`--vs-lane-*`) and heat
  tokens.
- **Active states** are never solid ink: a pressed segment button is `--vs-surface` with ink
  text, a passed route step is muted. Solid ink is left to the toast and the CRUD letters.
- **Phone width**: 16px side gutters, no horizontal page scroll; the strip scrolls sideways
  within itself, the drawer takes the full width.

## The block frame

`core.js` wraps every rendered block in `section.vs-block#block-<id>`:

- a kicker “NN · <group> · <label>” (NN counts rendered blocks; `group` is the `group.<name>` UI
  string, `label` the `<type>.label` one with `meta.json` `label` as the fallback; a render may
  replace the label with `ctx.kicker`), accent-coloured while the block
  is the route's active one;
- the actions: a diff switch when the block has one, actions the render added, and “collapse”;
- `h2` from `block.title` (or the label), a subtitle from `block.subtitle`;
- the render's node.

`meta.json` `"frame": "bare"` drops the kicker, heading and collapse: the block draws its own
header (the brief, whose h1 is the page heading). A block type's schema should declare `title` and
`subtitle` so the agent can set them.

**Empty blocks.** When `render` returns `null`, `undefined` or an empty `DocumentFragment`, the
block is not on the page at all, and route steps that point at it are dropped. A block decides its
own emptiness: a list block with an empty list, the glossary block on a page without a glossary.

## `render(block, ctx)`

`ctx` is made per block:

| Member | |
|---|---|
| `page`, `block`, `number` | the whole page data, this block, its kicker number (“04”) |
| `el(tag, attrs, children)` / `svg(tag, attrs, children)` | create an element; `attrs` values that are `null` / `false` are skipped, `on<event>` functions become listeners; children are nodes or strings |
| `icon(name, size)` | a Lucide-style stroke icon (`moon`, `sun`, `check`, `copy`, `x`, `chevronDown`, `chevronRight`) |
| `anchorChip(anchor, label?)` | the chip for an anchor: click opens the file in the drawer, hover only frames it; default label `file` / `file:N` / `file:A–B` / `file:A, B, C` |
| `sourceChip(source)` | the provenance chip: “code”, “test”, “ADR”, “doc”, and “inferred” (dashed) for `inferred` |
| `isInferred(obj)` | `obj.source === 'inferred'` |
| `t(key, vars?, fallback?)` | the UI string `key` in the page's language, `{name}` placeholders filled from `vars` (see **Locales**) |
| `plural(n, key, vars?)` | `t(key, { n, …vars })` with the plural form for `n`: `plural(3, 'route.summary', …)` → “3 steps · …” |
| `part(node, id)` | marks a node as the part `id` (`data-part`), so a route step's `focus` can frame it |
| `action(label, onClick)` | adds a button to the block's header |
| `mermaid(() => text)` | adds “copy as Mermaid” to the header (below) |
| `toast(text)` / `copy(text, toastText)` | the shared toast (1800 ms) / copy to the clipboard and toast |
| `on(event, fn)` / `emit(event, detail)` | the page-level event bus (below) |
| `onFocus(fn)` | called with a part id when the route focuses a part of this block |
| `onCleanup(fn)` | called before the block is rendered again (a diff mode switch); a block that mounted something outside plain DOM (a React root) tears it down here |
| `route()` / `goToStep(index)` | the route state / scroll to a step as a click on it would |
| `diff` | the diff-mode helpers (below) |
| `kicker(text)` | replaces the label in this block's kicker for this render (“layer 1 of 3”) |
| `read` | the reading progress (`verstat.read`, below) when the page carries the `read` module, else `undefined` |

Render with `ctx.el` and plain DOM; there is no framework. Text is highlighted for glossary terms
after `render` returns, so a block writes plain text. Mark containers whose text must not be
highlighted with `data-no-terms` (code, chips, buttons and SVG are skipped anyway).

A render that throws is logged and the block shows its JSON instead.

## Parts and focus

Any object inside a block with an `id` is a part (see [engine.md](engine.md)). Render a part
through `ctx.part(node, part.id)`. A route step with `focus` scrolls to its block and gives that
part `.vs-focus`: a 2px accent outline, and in SVG an accent 3px stroke. The block's `onFocus`
handlers run, the bus emits `focus` `{ block, part }`, and the document gets a `verstat:focus`
`CustomEvent` with the same detail. A step without `focus` clears it: the bus emits `focus`
`{ block, part: null }` (the `verstat:focus` event fires only for a part). A block that shows parts
one at a time (a sequence player) uses `onFocus` to move to the part.

## The route

`page.route` steps are shown in the rail or the strip. The `short` mode shows the `short` steps,
the `full` mode the `full` ones (`full` is the default); a block with no step in the current mode is collapsed with
“off the route · expand”. Collapsing or expanding a block by hand overrides the mode, until
the page is reloaded. Clicking a step expands its block if needed, scrolls to it (8px below the top
in the rail layout, below the strip in the strip layout), freezes the scroll-spy for 900 ms and
applies the step's focus. The scroll-spy marks the step of the lowest block on the page whose top is above
180px (the route may visit blocks in any order); at the bottom of the page, the step of the
lowest block.

The mode labels are “N min · answer / M min · in full”, and “N min · gist / M min · review” on
`explain-pr` pages (`page.skill`), where N and M are the mode's step `minutes` summed and rounded
up — no fixed length; a mode with no steps has its button disabled.

The route block (`type: "route"`) is an in-page overview of the same steps; it listens to the
`route` event, and hides its section when every step was dropped.

## Inferred

A claim with `source: "inferred"` is a deduction, not a fact: put `ctx.sourceChip(claim.source)`
next to it — the dashed “inferred” chip is the only mark on an HTML element; the element itself gets
no frame. Give it `.vs-inferred` anyway: in SVG that draws a `stroke-dasharray` from `--vs-dash`
(6/5). Facts keep solid lines.

## Diff mode

For `explain-pr` pages, a block shows a change by marking its parts:

- a part may carry `"change": "added" | "removed" | "changed"`; in the block schema,
  `"change": { "$ref": "verstat:page#/$defs/change" }`;
- a `changed` part may carry `"before": { <field>: <old value> }`, with the fields the block
  schema declares there;
- anchors of removed parts and of `before` values point into a repo pinned to the base commit,
  conventionally named `<repo>@base` in `page.repos`.

When `meta.json` has `"diffMode": true` and some part of the block has `change`, the header shows
Before / After / Diff (Diff is the default) and the block is rendered again on each switch, with:

| `ctx.diff` | |
|---|---|
| `mode` | `"before"`, `"after"`, `"diff"`; `null` when the block has no change marks |
| `shows(part)` | `false` for an `added` part in `before` and a `removed` part in `after` |
| `value(part, field)` | `part.before[field]` in `before` mode when the part has it, else `part[field]` |
| `mark(node, part)` | in `diff` mode, adds `.vs-added` / `.vs-removed` / `.vs-changed` to the node; returns the node |

`.vs-added` has the add tint and a left bar, `.vs-removed` the delete tint and a strike-through,
`.vs-changed` an accent bar; in SVG, added strokes are `--vs-add` and removed ones `--vs-del`,
dashed. Without change marks `shows` is always `true`, `value` reads the field and `mark` does
nothing, so a block can use them unconditionally.

A row of a shared table (`.vs-table-row`, below) carries no bar: an added row has the add tint, a
removed one the delete tint and struck-through cells, a changed one the accent-soft tint.

## Shared tables

`decision-table`, `failure-modes`, `claimed-vs-done`, `test-coverage` and `risks` use one table
layout from `verstat.css`: `.vs-table` (strong top rule, scrolls sideways inside the block) →
`.vs-table-grid` (`--vs-table-cols` for the columns, `--vs-table-min` for the width below which the
table scrolls) → `.vs-table-row` rows, the first one `.vs-table-head` (mono 11px muted). Cells:
`.vs-table-num` (row number), `.vs-table-main` / `.vs-table-text` / `.vs-table-sub` /
`.vs-table-mono`, and `.vs-table-code` for the right-aligned code column. By default each row is its
own grid, so a column is a fixed width or a fraction. Add `.vs-table-fit` to `.vs-table-grid` to make
the rows subgrid rows of one grid: columns can then be sized by content (`max-content`,
`minmax(min-content, 1fr)`) and still line up, cells break only a word that cannot fit, and the code
column keeps its pills on one line (`decision-table` uses it). A state is
`.vs-state` — a 9px dot and a label: `vs-state-problem` (solid accent), `vs-state-partial` (accent
ring), `vs-state-ok` (solid `--vs-add`), `vs-state-minor` (muted ring). On a narrow screen the
table keeps its columns and scrolls inside the block; the page itself does not scroll sideways.

## Locales

Every string the client and the renders show comes from `locales/<lang>.json`, never from the code.
`locales/en.json` is the reference and holds every key; another language is one more file with the
same keys (a test checks that). Keys are namespaced: `core.*`, `group.*`, `route.*`, `anchors.*`,
`mermaid.*`, `flow.*`, `read.*` for the client, `<type>.*` for a block type, `<type>.label` for its
name. A value is a string with `{name}` placeholders, or, for a count, an object of plural forms by
the categories of `Intl.PluralRules` for that language — `{ one, other }` in English,
`{ one, few, many, other }` in Ukrainian — each with `{n}` where the number goes.

`verstat.t(key, vars, fallback)` (`ctx.t` in a render) looks the key up in the page's dictionary,
then in English, then uses `fallback`, then the key itself; with a plural value it picks the form
for `vars.n`, by the rules of the dictionary the value came from. `verstat.plural(n, key, vars)` is
`t(key, { n, …vars })`. `verstat.label(type, meta)` is the block type's name. `verstat.lang` is the
page's `lang`. A block type from `--components` with no keys in `locales/` gets its `meta.json`
label and should pass its own text as `fallback`. Which dictionary a page gets is in
[engine.md](engine.md#page-language). Adding a UI language is a new `locales/<lang>.json`.

## Copy as Mermaid

`ctx.mermaid(() => text)` adds “copy as Mermaid” to the header; the function runs on click, so it
sees the current diff mode. The text is copied and the toast says “Mermaid copied — paste it
into a PR or README”. `verstat.mermaid.id(s)` turns any string into a safe node id, and
`verstat.mermaid.label(s)` escapes a label (`#`, quotes, `;`, `:`, brackets become `#<code>;`).

## Events

`ctx.on` / `ctx.emit` are one bus for the page. The client emits:

| Event | Detail |
|---|---|
| `ready` | `{ blocks }`: the ids of the rendered blocks, after all blocks rendered |
| `route` | the route state: `{ mode, steps, active, minutes, labels }`, on start and on every change |
| `focus` | `{ block, part }` when a route step focuses a part; `{ block, part: null }` when a step without `focus` clears it |
| `theme` | `{ theme }` when the theme changes (a block that draws with computed colours redraws) |

A listener added through `ctx.on` lasts for one render: when the block is rendered again (a diff
mode switch) its listeners are removed before the render subscribes anew. Blocks may emit their
own events for cross-block links, named `<type>:<what>` (a commit filter:
`commits:select`).

`dependency-graph:hover` is `{ block, node, label, cluster, paths }` while the pointer is over a
module of a dependency graph (`paths` are the paths of the module's anchors), and the same with
`node: null` (and empty fields) when it leaves. `hotspots` listens: it lights the groups that hold
the module's files and dims the rest. A group matches when one of its files is one of `paths`,
sits in the same folder (other than the repo root) as one of them, or its path is `label` or ends with `/<label>` (a bare file
name as `label` counts only when the module has no `paths`); a module
that matches no group dims nothing. The match compares paths only, not repos.

`commits:select` is the commit filter: `{ block, commit, repo, files }` — the `id` of the
`commits` block, the clicked commit's full sha (`null` when the click cleared the selection), its
`repo` (or `null` on a one-repo page) and its file paths, as in the block's data. A click on the
selected commit clears it. Nothing is required to listen: with no subscriber the click only marks
the row. A block that shows changes subscribes and, while `commit` is set, dims what the commit does
not touch to `opacity: .35` (matching by path, or by a fragment's own `commit` sha when it has one —
compare by prefix, either side may be short; a commit of a repo other than the block's matches
nothing); `commit: null` clears the filter. `doc-changes` dims its other fragments and the tabs of files the commit leaves alone.
`changes` dims to .35 the fragments of other commits — by the fragment's `commit` (a prefix of the
sha either way), or by its file's path when the fragment has no `commit` — dims the file tabs with no
matching fragment and shows a hint (a different one when nothing in the layer matches).

## Diagrams (React Flow)

`system-map`, `dependency-graph` and `state-machine` draw with React Flow through the shared
wrapper `client/modules/flow.js`. Their `meta.json` asks for `deps: ["dagre", "react",
"react-dom", "reactflow"]` and `modules: ["flow"]`, so no other page carries React. The wrapper is
plain JS (`React.createElement`, no JSX) and adds `verstat.flow`:

- `layout(spec)` — positions from dagre. `spec` is `{ rankdir: 'LR' | 'TB', groups: [{ id, title }],
  nodes: [{ id, title, sub, group, type }], edges: [{ s, t, label, part }] }`. A node's size comes from
  its text; a group becomes a frame around its nodes with room for its title; each edge gets its
  route from dagre's edge chain — `points` (absolute, orthogonal: it runs along the rank axis at each
  of dagre's dummy positions and changes lane only in the gap between two ranks, on a track of its
  own), `label` (the centre and size dagre reserved for the label, or `null`) and `entry` (the side of
  the target it enters) — plus the sides of its fallback handles from the geometry (forward
  `r → l` / `b → t`, a back edge under / beside the nodes, a parallel edge another slot); a self-loop
  gets the `loop` type, alternately above and below; the layout keeps room for a node's loops, so no
  other node or frame edge sits on them.
- `mount(container, props)` → `{ update(patch), destroy() }`. `props`: `spec` (plus per node `sub`,
  `note`, `hot`, `dash`, `tone: 'add' | 'del'`, `final`, `click`, `part`; per edge `label`, `on`,
  `dash`, `tone`, `key`, `part`), `height`, `ariaLabel`, `hl` (node ids to highlight), `sel` (the
  edge `key` drawn as selected), `focus` (a part id), and the callbacks `onNodeClick(id)`,
  `onNodeEnter(id)`, `onNodeLeave(id)`, `onEdgeClick(key)`. `update` re-renders with the patch
  (`hl`, `sel`, `focus`, callbacks); the `spec` is fixed at mount — `update` refuses one, so a block
  that shows another graph (the map's level switch) destroys and mounts again. A block calls
  `destroy` from `ctx.onCleanup`. React Flow gets edge ids by index; an author's id is only the
  edge's `part`. A block clears `focus` when the bus reports focus in another block or `part: null`.
- `toNodes(layout, spec, { hl, focus }, prev, onActivate)` / `toEdges(layout, spec, { sel, focus },
  onPick, moved, frames)` — the pure mapping from a layout to React Flow nodes (frames first, dragged positions
  kept from `prev`) and edges (route, handles, selection, focus), used by `mount` and tested on their
  own. `moved` is the set of node ids drawn away from their layout place; an edge touching one gets no
  route and falls back to a smooth-step between its handles. `movedNodes(layout, nodes)` builds that set
  from React Flow's node state (a node's place counts its frame's offset, so a dragged frame moves its
  nodes).
  `frames` are the frames' current rects (`{ id, x, y, w, h }`, following drags); a label whose centre
  `frameAt(frames, x, y)` finds on a frame takes the frame's surface as its background, so the line it
  hides under it doesn't leave a lighter box. The label layer is stacked above every edge, so a label
  always masks its own line.
  `onActivate(id)` makes a `click` node answer Enter / Space; `onPick(key)` makes the label of an
  edge with a `key` a button (an empty, invisible one when the edge has no label).

Behaviour: nodes and frames can be dragged (a frame carries its nodes); “+ / − / fit” bottom
right, “fit” puts every node back where the layout put it and fits the view; the wheel zooms
only after a click on the diagram, until the pointer leaves it; pinch always zooms; on a touch
screen dragging the canvas or a node also needs a tap first, so a swipe scrolls the page.
Edges are orthogonal lines with radius-6 corners along dagre's routes and an open chevron, so no
edge crosses a node it does not connect and each label sits in the room dagre reserved for it; an
edge of a dragged node (or of a node in a dragged frame) is a `smoothstep` between handles until
“fit” brings the routes back. Labels sit on the page background;
`on` / `sel` edges are accent 1.5px with an accent-ink label; `add` / `del` use `--vs-add` /
`--vs-del`, a `del` label is struck through. Colours are CSS variables, so a theme switch needs no
redraw. The diagram fits its frame again when its width changes (a collapsed block opened, rail ↔
strip) until the reader moves it. The React Flow attribution stays visible, top right.

The blocks put their details under the diagram in a `.vs-flow-panel` on `--vs-surface`: the
selected transition of a state machine (selected from the start: the first one), the clicked node
of a map or a graph. Clicking a node of a map or a graph also opens its first anchor in the drawer
(`verstat.anchors.open`).

## Changes

`changes` is one layer. Its kicker reads “NN · Changes · layer k of N” (k counts the `changes` blocks with files on
the page). Under the heading, the layer's files are tabs (no “all”): the path, `+N −N` and the
reading box; the first tab is selected (`--vs-surface`), a read tab that is not selected is dimmed
to .55. The selected file shows its fragments, ordered by their first line, each a card:

- a header `96px 108px 1fr auto` on `--vs-surface`: the lines of the new version (`12–14`, or
  “was 470–471” when the fragment only removes), the kind badge (READ on `--vs-accent-soft` /
  `--vs-accent-ink`, SKIM outlined in ink, SKIP muted; radius 4), the title, then the
  commit, `+/−` and `−`/`+`; under them the description and `· function`. Below 720px the header
  wraps: range, badge and counts on one line, the title and description under them;
- the body: old and new line numbers, a `+` / `−` marker, the syntax-coloured text, `…` between
  separate runs; a note is a card “AGENT NOTE · line N” under its line (on the base side for
  `side: "base"`); the fragment's test is a card “TEST OF THIS FRAGMENT” (green label) under the
  code with the test's chip (opens the drawer), its description and the test's lines.

Only `read` fragments start open; a click on the header opens or closes any. A route step focusing
a file selects its tab; focusing a fragment or a note also opens the fragment. A binary file, a lock
file or a file with no line changes shows a notice instead of fragments.

`test-coverage` with `mode: "diff"` draws the same table as the explain mode from the `read` and
`skim` fragments of all `changes` blocks: №, the state (green “covered” / accent “not covered”),
“file · function” with the test's description (or “the PR has no test that checks this change”) and the
test's chip; above it “N of M fragments covered”.

## Reading progress

The client module `read` (`client/modules/read.js` + `.css`) is on a page whose blocks ask for it in
`meta.json` `modules` (`changes`, and `doc-changes`, whose document tabs carry the same box as file
tabs). It adds `verstat.read` (also `ctx.read`):

| Member | |
|---|---|
| `key(repo, path)` | the key of a file: `repo/path` |
| `register(key)` | counts the file in “M” |
| `box(key, onChange?)` | registers the file and returns the reading box (a 15×15 checkbox button, green with a tick when read); `onChange(read)` runs on every change |
| `has(key)` / `toggle(key)` / `reset()` / `count()` / `total()` | the marks |
| `widget()` | a new “Read N of M files” + “reset” line (`null` when nothing is registered) |

Marks are kept in `localStorage` under `verstat.read.<hash of the question and the repo shas>`, so
they survive a reload and do not leak to another page. “reset” keeps its place but is invisible
and out of the tab order while nothing is marked. The line is shown in the rail under the question
and, on the page, at the end of the brief's stats line (or after the first `h1`), only when some
block registered a file.

## Commits

`commits` draws the history like `git log --graph`, newest on top (the block's list is oldest
first, as `verstat facts diff` prints it; a list already newest first is kept). The lanes come from
`parents` through `verstat.commitGraph(list)` (`client/modules/commit-graph.js`, on pages with the
block): for each row `{ col, color, into, outs, pass, beforeColors, afterColors }` and the number of
lanes. A branch keeps one colour, `--vs-lane-0…4`, from the lane where it starts; the first parent
continues the lane. A plain commit is a filled dot in its branch colour, a merge (two or more
parents) a hollow dot with a “merge” badge and no counts, an `external` commit a dashed hollow dot
with a “from <base>” badge (the brief's `pr.base`) and no counts; the selected commit is filled with
the accent. Row dividers start right of the graph; the repo column disappears when no commit names
a repo.

## Doc changes

`doc-changes` shows one tab per file (name and `+N −N`; `NNNN-….md` reads “ADR NNNN”) and under it
the file's `summary` and one card per hunk, in file order. A card's header is the changed lines of
the new version (“was A–B” for a removal only), the kind badge (READ / SKIM / SKIP),
the title and summary · file name, the commit, `+N −N` and a toggle; only “read” cards start open.
A hunk without a fragment is “skim”, titled by its section heading.

The body is formatted Markdown, made by `verstat.markdown` (`client/modules/markdown.js`, on pages
with the block), no library: `parse(lines)` splits a version into blocks with their lines — `h1`–`h4`
(`#####`… shows as `h4`, setext headings too), `p`, `li` / `oli` with nesting depth, `quote`, `code`
(fenced, a row per line), `table` (a row per line, header first), `hr`;
`fragment(old, new, hunkLines)` gives what a hunk shows: each block a hunk line falls in, whole —
from the old version for a removed line, from the new one otherwise — signed `-` (removed), `+` (has
an added line) or ` ` (context), removed before added within a change, with tables and code blocks
signed per row (a table keeps its header row) and the section heading above the hunk as context;
`inline(text)` gives runs for `**bold**`, `*italic*`, `` `code` ``, links (an `http(s)` link opens in
a new tab, others are text). Added parts have a `+` marker and the add tint, removed parts a `−`
marker, the del tint and strike-through; there are no left bars. Code wraps instead of scrolling.

Each card has “formatted / raw diff”: raw shows the hunk's lines as git printed them, with old
and new line numbers, scrolling sideways inside the card. A file too large to embed shows raw only;
a card whose change the formatted view cannot mark (a fence marker or a table separator row) opens in raw.
A route step focusing a file opens its tab; one focusing a fragment opens its tab and card.

## Code drawer

Hovering an anchor chip shows nothing but the chip's accent border. Clicking it opens a right
drawer, `min(720px, 100vw)`, with the whole embedded file, syntax-coloured. The header holds the
path, `repo@sha · line N` / `lines A–B` / `lines A, B, C` / `file`, a 32×32 copy button and a close
button. Copy puts `repo/path:A-B` (`repo/path:A,B,C` for several places, `repo/path` for a file) on
the clipboard; on `file://` it falls back to `document.execCommand('copy')`. An anchor with lines
scrolls the drawer to its first line (120px from the top) and highlights every anchored line; an
anchor on a file opens at the top with nothing highlighted. Esc, ✕ or the backdrop closes it and
returns focus to the chip.

**Block click.** A row or card that holds exactly one anchor chip and is at most 260px tall opens
that chip when clicked anywhere: going up from the clicked node towards its block `section` (never
the section itself), the highest ancestor with one chip is the host. While the pointer is over the
host, it gets a pointer cursor and the chip its accent border. With two chips or more only the
chips open. A click on another control (button, link, field, `[role=button]`, `[tabindex]`), on a
row that has its own click action (mark it `data-own-click`, as `sequence` and `path-tracer` rows
are), in the rail, the bar, the strip or the drawer, or one made while text is selected, opens
nothing.

**`#hash`.** On load and on `hashchange`, `#<element id>` or `#<block id>` (blocks are
`#block-<id>`) scrolls the target to 90px below the top of the window, expanding a block collapsed
by the route mode.

**Syntax.** `verstat.syntax.highlight(lines, path)` returns, for each line, the nodes of that line:
plain text and `span.vs-syn-{kw,str,com,num,ty,fn}` coloured by the `--vs-syn-*` tokens. The
language comes from the file extension (Go; JS/TS; Python/Ruby; Java/Kotlin/Scala/Swift/C#; PHP;
C/C++/Rust; shell/YAML/TOML), anything else stays plain; block comments and multi-line strings carry
over between lines. `verstat.syntax.tokens(line, path)` gives the `{ t, k }` tokens of one line, without state (the
tests use it). It is a light tokenizer, not a parser; the drawer uses it, and a block that shows code can too.

Glossary terms (the `term`, its `code`, and its `aliases`, longest first, whole words, ignoring
case) are underlined in the text of every block (the rail, the strip and the footer are left
as they are); hovering one shows a 340px popover with the term,
its code, the definition and its anchor chip. When two entries share a word (a term, code or alias), the first entry
in `page.glossary` wins.
