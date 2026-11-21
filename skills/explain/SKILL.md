---
name: explain
description: Answer a question about how code works with one self-contained HTML page whose every claim is anchored to a line of code and checked by a validator. Use when the user asks how something works across services or files, which states an entity goes through, where a value comes from, what rules decide something, when something happens, what happens when a part fails, what a system or module consists of, or asks for a tour of a codebase. Not for pull requests or diffs (use explain-pr).
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs *)
  - Bash(deno run -A ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs *)
  - Bash(bun ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs *)
---

# explain

Answer the user's question about code with a **page**: one HTML file built by the verstat engine
from a `page.json` you write. Every claim on it points at a line of code (an anchor), and the engine
checks each anchor against the repo at a pinned commit. Page texts are in English. If the user asks
for another language, write them in it and set `lang` to its tag (`uk`, `de`, …); the page UI
follows for the languages verstat has a dictionary for (`en`, `uk`) and stays English otherwise.

The engine is `${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs`. Below, `verstat <args>` means running it
with the runtime found in step 0, spelled exactly like this (unquoted path):

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs <args>
deno run -A ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs <args>
bun ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs <args>
```

## 0. A JS runtime is required

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs schema page`. If `node` is missing (command not
found) or older than 18, try the `deno run -A …` form, then the `bun …` form. Use the first one
that prints the page schema for every later call.

If none works, **stop**: tell the user the page needs Node.js 18 or newer (or Deno, or Bun), how
to install one (e.g. `brew install node`, `nvm install --lts`, https://nodejs.org), and that you
will build the page once it is installed. Do not write the page by hand and do not answer with a
page-shaped text instead.

## 1. Understand the question

Classify it by shape; a question may have two (pick the main one, add blocks of the second):

| Shape | Question | Blocks (besides the base set) |
|---|---|---|
| Q1 | How does X work? (an execution path through the system) | `system-map`, `sequence`, `path-tracer`, `timeline`, `failure-modes` |
| Q2 | Which states does X go through? | `state-machine`, `decision-table`, `invariants` |
| Q3 | Where does this value come from? | `data-model`, `field-lineage`, `crud-matrix`, `contract` |
| Q4 | By which rules? | `decision-table`, `calculation`, `simulator`, `test-coverage` |
| Q5 | When does it happen? | `timeline` |
| Q6 | What does it consist of / where is what? | `system-map`, `layers`, `module-card`, `dependency-graph`, `hotspots` |
| Q7 | What if it breaks? | `failure-modes`, `risks`, `invariants` |
| Q9 | How is it all built here? (a tour) | a few of the above: `system-map`, `layers`, `module-card`, `hotspots`, `sequence` |

Other types you may add when the code has that shape: `event-topology` (publishers, topics,
consumers), `config-panel` (a setting per environment), `code-anchor` (a short "where to look"
list). A question about a pull request, a branch or a diff is `explain-pr`, not this skill.

**Base set, on every page:** `brief` (first), `glossary`, `open-questions`, and `change-points`
(last). Add `route` only if an in-page overview of the reading route helps.

Fix the scope: which repos, services and files the answer touches. For each repo:

- run `git status --porcelain --untracked-files=no` in it. If it lists anything, the engine will
  reject the page. Ask the user to commit or stash, or work from a clean worktree
  (`git worktree add <dir> HEAD`) — do not stash or commit their work yourself;
- pin it: `git rev-parse HEAD` → `repos.<name>.sha`; `repos.<name>.path` is the checkout
  (absolute path). Anchors are read with git at that sha, so read the code at that sha too.

## 2. Gather facts

Deterministic facts first, then read the code:

- **Co-change and authors** for `change-points` and `hotspots`:
  `git log --format=%H --name-only -- <paths>` (which files change together),
  `git log --format=%an -- <path> | sort | uniq -c` (authors), `git log --oneline -- <path> | wc -l`
  (churn), `wc -l` (size).
- **Tests**: search for the names of the functions, handlers and states the answer uses in test
  folders; a behaviour with no test is said so (`test-coverage` “not covered”).
- **Config literals**: search for the keys, env vars, timeouts and thresholds the code reads.
- Read the rest: entry points, handlers, the calls between services, the contracts (`.proto`,
  OpenAPI, DTOs).

Write down only what the code shows. What you could not confirm goes to `openQuestions`, not into
a block as fact.

## 3. Choose blocks

Only blocks the question has a shape for. A block you cannot fill from the code is left out — an
empty block is not rendered anyway, and a thin one wastes the reader's time. Before writing a
block, print its schema and follow it exactly:

```bash
verstat schema <type>
```

The schema's descriptions are the instructions: which fields are anchors, which are parts (any
nested object with an `id`), which anchors carry a content check (`x-anchor-contains`). A few
fields are easy to miss: each `risks` item needs a `severity` (`high`, `medium`, `low`; the page
sorts by it); a `timeline` marks the interval when a state is held with `holds` and puts events
that can happen at any moment into `anytime`.

Order the blocks the way the answer reads: `brief` and `glossary`, then the structure
(`system-map`, `layers`), the states (`state-machine`), the flow (`sequence`, `path-tracer`), the
rules (`decision-table`, `calculation`, `simulator`), time (`timeline`), failures
(`failure-modes`, `invariants`, `risks`), `test-coverage`, `open-questions`, and `change-points`
last. The page numbers the blocks 01, 02, … in this order.

## 4. Write `page.json`

`verstat schema page` is the page model. Write the file **outside the explained repos** (or as an
untracked file there), e.g. `<scratch>/verstat/<slug>/page.json`.

- `schema: "verstat.page/1"`, `skill: "explain"`, `question`: the user's question as asked;
  `lang` only when the user asked for a language other than English.
- `repos`: `{ "<name>": { "sha", "path", "remote"? } }`; anchors use `<name>`.
- `glossary`: domain terms of the answer with `definition`, `code` (the identifier), `aliases`
  (the inflected forms the texts use) and an anchor where the term is defined.
- `blocks`: unique `id` per block, unique part `id`s inside a block.
- **Anchors** `{ repo, path, find, nth? }`: copy `find` verbatim from the file at the pinned sha —
  a distinctive piece of one line (a function signature, a call, a literal), not a whole block of
  code. If it occurs more than once, add `nth` (from 1). Where the schema asks for a content check
  (a state machine transition must contain the target state, a rule its condition literal, an
  invariant the line that enforces it), anchor the line that actually says it.
  The page embeds every anchored file whole, whatever the shape: never anchor a file that may hold
  secrets (`.env*`, credentials, CI config with tokens), and leave lock files and generated files
  (protobuf stubs, bundles, snapshots) without an anchor — they make the page heavy and tell the
  reader nothing. Other shapes: no `find` for a whole file
  (a small module or package entry); `findEnd` to span a range from `find` to it (a function body,
  a rule); `find` as a list for several places in one file (every line that throws the same error).
- **Provenance**: `source` is `code`, `test`, `adr`, `doc`, or `inferred` for your own deduction.
  Do not dress a deduction up as `code`.
- `openQuestions`: what the code did not settle, one question per item.

## 5. Write the route

`route` is the reading order: `{ block, focus?, minutes, why, modes }`.

- First step: the brief. Last step: `change-points`.
- `short`: the brief and the one diagram that answers the question best, about 3 minutes in
  total (the validator rejects more than 5). `full`: every block worth reading. A step in both
  modes lists both. The page labels each mode with the sum of its steps' `minutes`.
- **One block is one step**: a block appears in the route once (the validator rejects a repeat).
  To point at a second part of the same block, say so in that step's `why`.
- **Estimate only what is on the page**: a step's `minutes` is the time to read that block as the
  page shows it, not the code behind it. Reading the source files is not a step.
- `focus` names the part of the block the step is about (a service, a message, a transition), so
  the page frames it; `why` says in one sentence what the reader gets from the step.

## 6. Validate

```bash
verstat validate <page.json>
```

Exit 0 prints `ok` and one `inferred: <path> — <reason>` line per claim whose content check
failed. Exit 1 prints `error: <json path>: <message>` lines on stderr: fix every one (a wrong
`find`, a missing `nth`, a field the schema does not allow, a route step pointing at a missing
block or part) and run it again until it passes. Then reread each `inferred` line: either the
anchor points at the wrong line (fix it) or the claim really is a deduction (leave it — it is shown
as “inferred”).

## 7. Build and hand over

```bash
verstat build <page.json> -o <page.html>
```

Check the exit code (a failed build leaves an older file as it was). Give the user the path of the
HTML file. Tell them it opens from disk with no network, and that it **embeds every file an anchor
points into, whole** (the page footer says so too) — they should think before forwarding it outside
the people who may see that code.
