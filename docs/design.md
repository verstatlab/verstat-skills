# verstat-skills: design spec of the code visualizations

What the skills do and how a page is built: the blocks (§5), the page model (§6), the validation
rules (§7), the engine (§9) and the plugin layout (§10).

## 1. Goal

Skills that answer a question about code with a **page** rather than text in the chat: “what did
this PR change”, “how does order payment work in this project”. The page is one self-contained
HTML file. Every claim on it is tied to a line of code, and a machine checks that.

Why this beats an answer in the chat:
- the claims are checked by a validator, and what is not checked is marked as such;
- diagrams, a player and a reading route instead of a wall of text;
- the file can be forwarded, and it opens from disk with no network.

Who it is for: a newcomer to the project, an analyst, QA, a PR reviewer, the same developer half a
year later. The question often spans several services and several repos — the page must stay
checkable then too.

## 2. Scope

**In scope:**
- two skills — `explain-pr` and `explain`;
- the whole block catalogue (§5), the simulator included; no 3D scenes (§5, “Not built: 3D”);
- the `verstat.mjs` engine: validating and building the page;
- a Claude Code plugin with its own marketplace.

**Not doing:**
- mounting the page into another app or a Claude artifact;
- external knowledge bases as a source of the glossary or provenance — everything comes from the
  code and git;
- language-specific AST extractors: the agent plus the anchor validator;
- re-checking old pages: a page is single-use; when the code changes, we generate a new one;
- a “what was reviewed” block;
- “who else calls this” on hovering an anchor — that is IDE navigation.

## 3. Skills

| Skill | Answers | Input | End of the route |
|---|---|---|---|
| `explain-pr` | What changed and how to review it (Q8) | PR / branch / commit range | “What the reviewer should look at” |
| `explain` | How X works, which states it goes through, where a value comes from, by which rules, when, what breaks how (Q1–Q7, Q9) | a natural-language question + repo | “Change points” |

Both skills are only a prompt: which questions to ask of the code, which blocks fit which shape of
question, how to build the route. Blocks, schemas, the engine and the render are shared.

`explain-pr` is not a separate set of blocks but a **diff mode** on top of the same ones: a state
machine or a decision table shows “before / after” by highlighting the changed transitions and
cells. PR-specific blocks are added to them (the “Changes” group, §5).

Candidates for separate skills — they will appear when separate question shapes show up. A new
skill = a new prompt, not a new render:

| Skill | Questions | Main blocks |
|---|---|---|
| `explain-flow` | Q1, Q5, Q7 | system map, sequence, path tracer, timeline, failure modes |
| `explain-lifecycle` | Q2 | state machine, decision table, invariants |
| `explain-data` | Q3 | data model, lineage, CRUD matrix |
| `explain-rules` | Q4 | decision table, calculation, simulator, tests |
| `tour` | Q6, Q9 | graph, hotspots, module cards, glossary |

One general `visualize` skill that picks the shape itself was rejected: narrow skills trigger more
precisely from their description and have shorter prompts.

## 4. How a skill works

1. **Understand the question.** Work out its shape (Q1–Q9) and bounds: which services, repos and
   files the topic touches. For `explain-pr` the diff sets the bounds.
2. **Gather facts.** Deterministically, with no language knowledge: the diff, git log (co-change,
   authors), the tests found, config literals by search. The agent reads the rest itself.
3. **Pick the blocks.** Only those the question has a shape for; an empty block does not get onto
   the page.
4. **Write `page.json`** following the JSON Schema of the blocks (§6). The agent writes the
   curated layer: texts, links, anchors, the route.
5. **`verstat validate page.json`.** Fix the errors and repeat. A claim whose content the anchor did
   not confirm is not an error — it becomes an “inference” (§7).
6. **`verstat build page.json -o page.html`** and hand the path to the user.

A JS runtime (Node ≥ 18, Deno or Bun) is required. Without one of them the skill stops before
step 1 and tells the user what to install; it does not build the page by hand.

The page texts are in English. When the user asks for another language, the agent writes the texts
in it and sets `lang` (§6); the page UI follows for the languages verstat has a UI dictionary for
and stays English otherwise.

## 5. Blocks

The blocks follow from the question shapes:

| # | Question | Answer shape | Example |
|---|---|---|---|
| Q1 | How does X work? | an execution path through the system | “how order payment works” |
| Q2 | Which states does X go through? | an entity's life cycle | order: pending → paid → shipped → refunded |
| Q3 | Where does this value come from? | data lineage | where the invoice total comes from |
| Q4 | By which rules? | a decision table / formula | when a refund is automatic and when manual |
| Q5 | When does it happen? | a timeline / schedule | when the money is charged relative to confirmation |
| Q6 | What is it made of / where is what? | a map of the system / module | services, their stores and links |
| Q7 | What happens if it breaks? | failure modes | the payment gateway did not respond |
| Q8 | What changed? | diff mode | a PR, a branch, a release |
| Q9 | How is everything arranged here? | a tour through several shapes above | “show me the billing service” |

“Data”: *auto* — the engine extracts it, *agent* — the agent writes it, *mix* — the agent on top of
the facts.

### Foundation — on every page

In both `explain` and `explain-pr`: the glossary and open questions in `explain-pr` look the same as
in `explain` (the glossary after “Claimed vs done”, open questions before “What the reviewer
should look at”).

| Block | What it shows | Data |
|---|---|---|
| **Code anchor** | A code chip for a file, a line, a range or several lines: a click opens a drawer with the whole file at those lines; hovering shows nothing | auto |
| **Brief** | The answer to the question in 1–2 sentences + 3–5 key facts; visible without scrolling | agent |
| **Glossary** | Domain terms with a definition and a place in code; highlighted in every text on the page | mix |
| **Route** | The reading order with the time for each step; highlights parts of other blocks (scrollytelling); modes “short” (≈3 min, no more than 5) and “full” (the sum of the steps); one block — one step | agent |
| **Open questions** | What could not be confirmed by the code — stated, not left out | agent |
| **Change points** | The end of `explain`: which file to start a change from, what changes together (co-change from git), what is dangerous to touch, which test to run. In `explain-pr` — “what the reviewer should look at” | mix |

### Structure — “what it is made of”

| Block | What it shows | Data |
|---|---|---|
| **System map** | Services, stores, external APIs, queues and the links between them; levels of detail system → service → module; the nodes relevant to the question highlighted | mix |
| **Layers** | Architectural roles (controller / service / repository / worker) and the files in them | mix |
| **Module card** | Role, public members, what to read / skim / skip | mix |
| **Dependency graph** | Imports and calls between modules, clusters, cycles | mix |
| **Hotspots** | A treemap: size = lines, color = change frequency / number of authors | auto |

### Behavior — “how it works”

| Block | What it shows | Data |
|---|---|---|
| **Sequence diagram** | Participants × time, messages with anchors on the sender and the handler; a step-by-step player | mix |
| **Path tracer** | One request or event through the layers: the happy path and the failure branches, every node an anchor | mix |
| **State machine** | The states of an entity, transitions with a trigger, a condition and a place in code; unreachable and dead-end states | mix |
| **Decision table** | Rules as a matrix of conditions × outcome; empty and contradicting cells are visible at once | mix |
| **Step-by-step calculation** | A real example input through the formula, every step with an anchor | agent |
| **Simulator** | The same with editable inputs: change them — see the result | agent |
| **Timeline** | Events relative to a reference point: schedules, delays, TTLs, timeouts, retries | mix |
| **Event topology** | Who publishes, which topics / queues / webhooks, who consumes | mix |

### Data — “where the value comes from”

| Block | What it shows | Data |
|---|---|---|
| **Data model** | Entities, relations, who owns what | mix |
| **Field lineage** | The path of one value: where it is born, which transformations, where it is stored, who reads it | mix |
| **CRUD matrix** | Tables, cache keys (with a TTL) × services: who creates / reads / updates / deletes | mix |
| **Contract** | Endpoints, headers, payloads between services | mix |
| **Config panel** (`config-panel`) | A parameter, its values per environment, the default in code, what it affects | mix |

### Reliability — “what breaks how”

| Block | What it shows | Data |
|---|---|---|
| **Failure modes** | Situation → what the code does → what a person sees, with an anchor | mix |
| **Invariants** | What must always hold and where it is enforced | agent |
| **Risks** | A list by severity (high / medium / low): the risk, the consequence, the source and the code; folded after six | agent |
| **Test coverage** | Behavior → the tests that pin it down; an honest “not covered”. In diff mode — a change fragment (“read” and “skim”) → a test or “not covered”, headed “N of M fragments covered” | mix |

### Changes — diff mode

| Block | What it shows | Data |
|---|---|---|
| **Claimed vs done** | What the PR description promises and where it is in the code — or that it was not found | mix |
| **Commits** | The branch history with the intent of each commit | mix |
| **Moved code** | What was moved without changes, so it is not read twice | auto |
| **Noise** | Imports, wiring, formatting — folded | auto |
| **Changes by layer** (`changes`) | The PR code without noise, tests and documentation, split by the agent into layers in reading order; each layer is a block of its own and a route step. In a layer — file tabs, in a file — fragments with a kind “read / skim / skip”, a title, a description, a function, a commit, the agent's notes on lines and the fragment's test. The engine takes the fragment lines from git | mix |
| **Documentation** (`doc-changes`) | Changed `.md` files as formatted Markdown with the `+` / `−` changes marked and a “formatted / raw diff” switch; the raw diff comes from git, not rebuilt from the parsed blocks | mix |
| **What the reviewer should look at** (`reviewer-focus`) | The end of `explain-pr`: a numbered list of the places to look at first | agent |

Notes on lines are part of `changes`; there is no separate block for them. There is no separate
block for test changes either: that is the diff mode of “Test coverage”.

The order of an `explain-pr` page: 01 gist · 02 claimed vs done · 03 commits · 04 states before /
after · 05 rules · 06 documentation · 07–09 changes by layer · 10 test coverage · 11 moved code and
noise · 12 what to look at. The agent sets the order in `page.json`.

The other blocks show “before / after” in diff mode by highlighting: the changed transitions of a
state machine, the cells of a decision table, the steps of a sequence.

### Not built: 3D

There are no 3D scenes. A code city, a layered scene with a flow, a 3D graph and a time tunnel
showed the same as their 2D counterparts, only harder to read: the third dimension carried no data
of its own. At the scale of one page (tens of files, a linear route) the 2D blocks — system map,
dependency graph, hotspots, sequence diagram — read faster. 3D is worth coming back to only when a
shape appears where depth encodes a metric of its own, or the scale (hundreds of nodes) does not
fit in 2D.

Rules for every block:
- **An empty block is not rendered.**
- **The brief answers the question** in 1–2 sentences, and that answer is visible without
  scrolling.
- **The state machine and the sequence diagram** have a “copy as Mermaid” button: the diagram can be
  pasted into a PR or a README.

**An example of composing a page.** The question “how does order payment work in this project”
gives a page:
1. **Brief** — one sentence: what starts the payment and how it ends.
2. **Glossary** — order, capture, refund, webhook.
3. **System map** with the participants highlighted, along which the “payment confirmed” event
   moves step by step.
4. **State machine** of the order — where the payment is in it.
5. **Sequence diagram** from pressing “Pay” to the email to the client.
6. **Decision table** of refunds + a **step-by-step calculation** of the amount on one order.
7. **Timeline** — what happens at once, what on a schedule, when the client sees the result.
8. **Failure modes** and **invariants** (“a repeated webhook does not charge twice”).
9. **Test coverage**, **open questions**, and at the end — **change points**.

## 6. Page model

```jsonc
{
  "schema": "verstat.page/1",
  "skill": "explain",
  "question": "How does order payment work?",
  "lang": "en",
  "repos": {
    "orders": { "remote": "git@…/orders.git", "sha": "3f9a1c2" },
    "payments": { "remote": "git@…/payments.git", "sha": "8b04d1e" }
  },
  "glossary": [
    { "term": "capture", "definition": "…", "anchor": { "repo": "payments", "path": "…", "find": "…" } }
  ],
  "blocks": [
    { "id": "order-states", "type": "state-machine", "states": [ { "id": "pending", … } ],
      "transitions": [ { "id": "t-paid", "from": "pending", "to": "paid",
                         "trigger": "…", "anchor": { … } } ] },
    { "id": "refund-rules", "type": "decision-table", … }
  ],
  "route": [
    { "block": "brief", "minutes": 1, "why": "…", "modes": ["short", "full"] },
    { "block": "order-states", "focus": "t-paid", "minutes": 2, "why": "…", "modes": ["full"] }
  ],
  "openQuestions": [ "…" ]
}
```

- **Blocks are addressed by `id`**, not by type: a page may hold two state machines.
- **Parts of blocks** (a state, a transition, a cell, a step) have their own `id`s. The route
  focuses on them through `focus`, and scrollytelling highlights exactly that part.
- **The route has two modes**: `short` (≈3 min — the answer and one diagram; the validator lets
  through no more than 5) and `full` (everything worth reading). The mode's label is the sum of its
  steps' `minutes`. One block — one step: a block is in the route once. A step estimates only what
  is on the page, not code outside it. The reader switches the mode; details off the route are
  folded by default.
- **Provenance** is a field of a claim (`source: code | test | adr | doc | inferred`), not a
  separate block. The render shows it next to the fact.
- **Language**: `lang` (a BCP 47 tag, default `en`) is the language of the page texts. It sets
  `<html lang>` and the language of the UI: the UI strings live in `locales/<lang>.json`
  (`en` and `uk` today); a language with no dictionary gets the English UI.

## 7. Anchors and validation

An anchor is `{ "repo", "path", "find", "nth"? }`. Repos are described once, in the page's `repos`.
Besides a line, an anchor may point at a whole file, at a range of lines or at several separate
lines; `docs/engine.md` (“Anchors”) describes the exact shape. Anchor fields in the block schemas
are marked `"x-anchor": true`, so the validator walks every block the same way and knows nothing
about particular types.

The validator rejects a page when:
- the file does not exist at its repo's `sha`;
- `find` is not found;
- `find` is found several times and `nth` is not given;
- the repo's working tree is dirty — the `sha` does not match what the agent saw;
- the route points at a missing block or part;
- a block is in the route twice, or the `short` steps add up to more than 5 min;
- a block does not match its JSON Schema;
- on an explain-pr page with a non-empty diff some changed file is shown nowhere: each must be in a
  `changes` layer, in `doc-changes`, among the tests (`test-coverage` in diff mode) or among moved
  code or noise; a file is in two layers; a layer holds an unchanged file; a note is not on a line
  shown in a fragment of its file.

**Content check.** For the blocks where it is easiest for the agent to lie, the schema declares what
the anchor's line must contain:
- a state machine transition — the name of the target state;
- a decision table rule, a calculation or simulator step — the literal of the condition or
  threshold;
- an invariant — the line that enforces it.

If the content is not confirmed, the page is not rejected. The claim gets `source: inferred` and
renders as an **“inference”** — visually distinct from a fact.

At build time every file an anchor points into is embedded in the HTML whole (once per file), so
the drawer shows the whole file and the page needs no access to the repo.

## 8. Block registry

```
components/<type>/
  schema.json   the block's JSON Schema; the agent reads it as an instruction
  render.js     the client render: (block, ctx) → DOM
  meta.json     { "deps": ["dagre"], "group": "behavior", "diffMode": true }
```

Adding a block = adding a folder (plus its UI strings in `locales/`). Neither the engine, nor the
validator, nor the skills change, except the skill prompt if it should offer that block.

Why JSON Schema: the agent reads the schema directly as an instruction, and the engine checks it
with no dependencies. A minimal JSON Schema validator (types, required, enum, `$ref`) is part of the
engine.

## 9. Engine and build

`bin/verstat.mjs` is one file with no dependencies, committed built. It runs on Node ≥ 18, Deno or
Bun.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs" validate page.json
node "${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs" build page.json -o page.html
node "${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs" schema state-machine   # prints the block schema for the agent
```

How a page is built:
- `shell.html` + the shared client code (route, anchors, glossary, themes, UI strings);
- the `render.js` of only the types on the page;
- the libraries from the `deps` of those blocks, from `vendor/`;
- `page.json` together with the embedded code (the whole files anchors point into) — as
  `<script type="application/json">`, and next to it the UI strings of the page's language.

Sequences, tables and timelines are drawn with our own SVG and HTML. We do not take Mermaid: it
weighs several MB, and a page with one block has to stay small.

**Diagrams** — the system map, the dependency graph and the state machine — are on React Flow
(`reactflow` together with React and ReactDOM, UMD builds from `vendor/`, no JSX). The libraries get
only onto pages with these three blocks (through `deps` and `modules` in `meta.json`) and add
≈330 KB (≈100 KB gzip); the other pages stay plain JS. Nodes and repo frames can be dragged, the
“+ / − / fit” buttons are at the bottom right (“fit” puts the nodes back), wheel zoom works only
after a click on the diagram, pinch always; orthogonal lines with radius 6 along dagre's routes and
open chevrons;
loops are an edge type of their own, `loop`. The React Flow attribution is not hidden. dagre
(`vendor/`) computes the layout; there are no hand-set coordinates. The decision is in the “Design
decisions” section of the README.

The libraries in `vendor/` are pinned with checksums, and their licences are embedded in the HTML.

**The raw diff of documentation** (`doc-changes`) the engine takes from git, like the code diff.

**Fonts.** IBM Plex Sans and Plex Mono are embedded as a subset: Latin and Cyrillic, 400 and 600 for
Sans, 400 for Mono, in woff2. Archivo 800 is only for the logo in the bar, a Latin subset. The
fallbacks are the system ones (`system-ui`, `ui-monospace`). A page with one block and no libraries
in `deps` must not exceed 165 KB together with the fonts and the syntax highlighting (see
`docs/engine.md` “Fonts”); a diagram block on React Flow adds ≈330 KB of libraries and the wrapper
to that (a page with one state machine is ≈550 KB).

**Theme** — light and dark, tokens in `client/verstat.css`. The accent is the Verstat Lab brand:

| Token | Light | Dark |
|---|---|---|
| `--vs-bg` | `#f6f6f4` | `#1b1c1f` |
| `--vs-surface` | `#ececea` | `#24262a` |
| `--vs-raised` | `#ffffff` | `#202125` |
| `--vs-ink` | `#1b1c1f` | `#d5d6da` |
| `--vs-muted` | `#62656c` | `#8f939b` |
| `--vs-rule` / `--vs-rule-strong` | `#dfe0e3` / `#c9cbd0` | `#2f3237` / `#40444b` |
| `--vs-accent` | `#ec3013` | `#e0614c` |
| `--vs-accent-ink` | `#b8230b` | `#e98a78` |
| `--vs-accent-soft` | `#fce4de` | `#35221e` |
| `--vs-add` / `--vs-add-soft` | `#1c7a47` / `#e1f2e8` | `#6db48c` / `#1d2e24` |
| `--vs-del` / `--vs-del-soft` | `#75706b` / `#e9e7e4` | `#8f939b` / `#26282c` |

The other tokens — syntax highlighting `--vs-syn-kw / -str / -com / -num / -ty / -fn`, the lane
colors of the commits graph `--vs-lane-0…4` (deliberately not from the main palette),
`--vs-heat-*`, `--vs-err`, `--vs-scene-bg` — are set in `client/verstat.css`. What is removed in a
diff is grey, so it is not confused with the accent. The dark theme is muted on purpose: not a black
background and not white text.

**Active states without black.** The selected tab, a segment (“short / full”, “Before / After /
Diff”), the active endpoint — a `--vs-surface` fill, ink text; a passed route step is muted. Solid
ink is left only on the toast and the CRUD letters.

**Header.** The Verstat Lab logo: a V mark of five squares (the bottom one accent), next to it
“VERSTAT LAB” (9px) and the skill name (19px), both Archivo 800; then `repo@sha`, the validation
chip, the theme button.

**Client behavior** (`client/`, shared by every page):
- **Code anchor.** Chips are alike: mono 12px, padding 2px 8px, surface, a rule border, an accent
  border on hover. Hovering opens nothing. A click opens a right drawer `min(720px, 100vw)` with
  the whole file. The drawer header: the path, `repo@sha · line N` / `lines A–B` / `file`, a copy
  button (32×32) — copies `repo/path:A-B`, and “close”. A file anchor — the file from the top with
  no highlight; a line, a range or several lines — scrolled to the first and all highlighted.
- **Block click.** When a row or a card has one code chip, the whole row is clickable (up to 260px
  high), and the chip is highlighted while the pointer is over the row. Several chips — only the
  chips. Selecting text does not open the drawer.
- **Going to a `#hash`** — scrolls to the block with a 90px offset.
- **Glossary.** Terms in the texts are underlined with dots; hovering shows a 340px popover with
  the definition and the anchor.
- **Route.** The `rail` layout (a 300px left column) from 1280px wide, narrower — `strip` (a sticky
  bar at the top). The active block is the last one whose top is above 180px from the top of the
  window. A click on a step scrolls to the block and turns tracking off for 900 ms; the part of the
  block in `focus` gets an accent frame. The `short` mode shows only the `short` steps; the other
  blocks are folded with an “expand” button.
- **Sequence player.** A step every 1400 ms, stopping at the last one; a click on a row goes to that
  step.
- **Copy as Mermaid** — copies `stateDiagram-v2` / `sequenceDiagram`, a toast for 1800 ms.
- **Theme** — light and dark, a button in the bar; the default is `prefers-color-scheme`.
- **UI language** — every UI string comes from `locales/<lang>.json` through `verstat.t`, with
  English as the fallback; plural forms follow `Intl.PluralRules` of that language.

Libraries and fonts come only from `vendor/`, no CDN. The `rail` / `strip` threshold is 1280px.

The page footer: the skill, the question, repo@sha and the line “Contains code (whole files) from
<repo>.” The README says the same.

## 10. Plugin layout

```
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
skills/explain/SKILL.md
skills/explain-pr/SKILL.md
components/<type>/{schema.json,render.js,meta.json}
client/                  shell.html, route, anchors, glossary, themes — shared by every page
locales/                 the page UI strings: en.json and one file per language
vendor/                  pinned libraries (dagre, React Flow) and fonts + licences
src/                     the engine source
bin/verstat.mjs          the built engine
docs/                    the spec, the engine and client docs
```

Skills reach the shared files through `${CLAUDE_PLUGIN_ROOT}`. Claude Code substitutes it in the
SKILL.md text and in `allowed-tools`, so the engine call can be allowed without a permission prompt.
Paths like `../../components` do not work: an installed plugin is copied into a cache.

`npx skills add` (other agents, no plugin) copies only the skill folders, so the shared files do not
get there. If that road is ever needed — a build that puts a copy of the engine and the components
into each skill. Until then we do not do it.
