---
name: explain-pr
description: Explain a pull request, a branch or a commit range as one self-contained HTML page for its reviewer — what changed, whether it does what it claims, what was only moved or is noise, and where to look first — with every claim anchored to a line of code and checked by a validator. Use when the user asks what a PR, branch or diff changes, asks to explain or walk through a PR before review, or gives a PR link / number, a branch, or a range like A..B or A...B.
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs *)
  - Bash(deno run -A ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs *)
  - Bash(bun ${CLAUDE_PLUGIN_ROOT}/bin/verstat.mjs *)
---

# explain-pr

Explain a change with a **page**: one HTML file built by the verstat engine from a `page.json` you
write. The page reads as a review guide: the change in brief, what it claimed against what it did,
the commits, the touched behaviour shown before / after, the documentation, the code in layers in
reading order — every changed line in a fragment with your review and the test that covers it — test
coverage, what was only moved or is noise, and finally what the reviewer should look at. Every claim
points at a line of code, checked by the engine at a pinned commit. Page texts are in English. If
the user asks for another language, write them in it and set `lang` to its tag (`uk`, `de`, …); the
page UI follows for the languages verstat has a dictionary for (`en`, `uk`) and stays English
otherwise.

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
will build the page once it is installed. Do not write the page by hand.

## 1. Pin the change

The input is a PR (link or number), a branch, or a range.

- **PR**: read its title, description, source and target branch (`gh pr view <n> --json
  title,body,headRefName,baseRefName,headRefOid,commits` on GitHub, or the host's equivalent; or
  ask the user to paste the description). Fetch the head (`git fetch origin pull/<n>/head` on
  GitHub). For a merged PR take the head commit of the PR, not the merge commit, and note the
  merge commit (`gh pr view <n> --json mergeCommit`).
- **Branch**: compare it with its target (ask if not obvious; usually the default branch).
- The range is `<base>...<head>`: three dots diff from the merge base, which is what a reviewer
  sees. A range the user wrote as `A..B` is taken as written.

Pin both sides. `head` = `git rev-parse <head>`, and `base` =

- an open PR or a branch: `git merge-base <target> <head>`;
- a merged PR: `git merge-base <mergeCommit>^1 <head>` — the target as it was just before the
  merge. Not `git merge-base <target> <head>`: after a merge commit the head is part of the
  target, and that would return the head itself (an empty diff). Works for merge, squash and
  rebase merges alike;
- a range: its left side for `A..B`, `git merge-base A B` for `A...B`.

`base` is now fixed, so every later diff uses two dots (`<base>..<head>`): three dots would
compute a merge base again and could drift from the `@base` checkout.

The page needs two checkouts of the same repo, both clean
(`git status --porcelain --untracked-files=no` prints nothing):

- `<repo>` at head: `git worktree add --detach <scratch>/<repo>-head <head>`;
- `<repo>@base` at base: `git worktree add --detach <scratch>/<repo>-base <base>`.

Do not check out anything in the user's own working tree; if it is dirty and you need it, ask the
user to commit or stash. Remove the worktrees you added when the page is built
(`git worktree remove`).

## 2. Facts of the diff

```bash
verstat facts diff <base>..<head> --dir <head checkout> > <scratch>/facts.json
```

It prints `files` (path, status, additions, deletions), `commits` (oldest first), `moved` (runs
of code that only moved), `noise` (imports, whitespace, lock files) and `totals`. Use them as they
are:

- `moved` → the `moved-code` block's items, `noise` → the `noise` block's items, pasted as printed
  (you may rewrite the titles to say what moved; on a page with `lang`, write the titles in that
  language);
- `commits` → the `commits` block, in the printed order (oldest first): give each an `id`, use
  `subject` as `message`, add `intent` (why the commit exists, in one sentence), drop `short`, keep
  `parents` and `external` (a base-branch commit a merge brought in; it is drawn dashed and is not
  counted in the brief's `commits`);
- `totals` and `files` → the brief's `pr` and `numbers`.

Then read the real changes — the files not covered by `moved` / `noise` — at both checkouts, and
sort them: **code** goes into layers (`changes`, step 3), **documentation** into `doc-changes`,
**tests** into `test-coverage` in diff mode. You do not copy diff lines into the page: the engine
reads the diff from git between `<repo>@base` and `<repo>` and puts each fragment's lines on the
page itself. Large generated files (protobuf stubs, snapshots) that `noise` does not catch still go
into a layer, as one `skip` fragment saying they are generated; the page cuts a fragment past 400
lines on its own.

## 3. Choose blocks

In route order — put them into `blocks` in this order too, since the page numbers its blocks 01, 02,
… as they come (a typical PR: 01 brief · 02 claimed vs done · 03 commits · 04 states before /
after · 05 rules · 06 documentation · 07–09 three layers · 10 test coverage · 11–12 moved and
noise · 13 open questions · 14 what to look at; `risks`, when present, just before the last):

1. `brief` — the change in 1–2 sentences, with `pr` (`title`, `head`, `base`, `additions`,
   `deletions`, `files`, `commits`) and `numbers` (e.g. real changed lines vs moved vs noise).
2. `claimed-vs-done` — each promise of the PR description (and of commit messages, when the
   description is thin) with the anchor where it is done, or marked not found.
3. `commits`. (Domain terms the change introduces or relies on go into the page's `glossary`.)
4. **The behaviour the change touches**, as the blocks of `explain` in diff mode: a changed state
   machine (states before / after), then a decision table (rules) or a sequence (these have
   Before / After / Diff); for structure the change adds (a new service, a new contract) the block
   of that shape (`system-map`, `contract`, `data-model`, `failure-modes`, …) describing the head.
   Mark parts `change: added | removed | changed`, give a `changed` part `before` with its old
   values; anchors of removed parts and of `before` values point into `<repo>@base`.
5. `doc-changes` — when the diff changes Markdown files (`.md`, `.markdown`): `repo`, `base` and
   one entry per changed document with a one-sentence `summary` and the `fragments` worth
   describing. A fragment is one hunk of the file's diff (three lines of context, as `git diff`
   prints it), picked by `find` — text from one of its lines; give it `kind` (`read` when what the
   document says changed, `skim` for small or mechanical edits, `skip` for wording, links,
   formatting), a `title` in a few words, a `summary` and the `commit` that made it. Hunks you do
   not describe are still shown. The engine embeds both versions of each file and renders the
   Markdown; you copy no text. Code stays out of this block.
6. **`changes` — the code, in layers.** Split the code of the PR (no noise, tests or
   documentation) into 2–4 layers in the order a reviewer should read them — what the rest builds
   on first (a model, a package's API), then its users (the app, the handlers), then the wiring.
   One `changes` block per layer, each its own route step: `title` names the layer, `subtitle` says
   why it comes here; `repo` (`<repo>`), `base` (`<repo>@base`). Per file (a file is in one layer)
   its `fragments`, and **every changed line that is not moved code or noise is in exactly one
   fragment**:
   - `kind`: `read` — behaviour changed (open on the page), `skim` — small or mechanical,
     `skip` — imports, renames, wiring;
   - `title` (a few words), `description` (what changed and why), `function` (where it sits),
     `commit` (the commit that brings it — the commit filter uses it);
   - `at`: the fragment's bounds, `{ find, findEnd? }` copied from the new version — or
     `side: "base"` and text of the old version for lines that were only removed. Leave `at` out
     to take the whole diff of the file (a new file, a small edit);
   - `notes`: `{ at: { find, side? }, text }` on the lines worth a reviewer's attention; a note
     sits on a line its fragment shows;
   - `test`: `{ name, description, anchor }` — the test that fails when this fragment breaks,
     anchored with `find` on its first line and `findEnd` on its last (the page shows those
     lines; a list `find` is rejected). Leave it out when no test covers the fragment; do not
     invent one.
   The validator fails on a changed file on no layer (and not in `doc-changes` or the tests), a
   file in two layers, a changed line in no fragment or in two, a note off its fragment's lines,
   a test without an anchor.
7. `test-coverage` with `mode: "diff"` — no `behaviors`: the page lists the `read` and `skim`
   fragments with their tests, or “not covered”. `files` lists the test files the PR changes
   (`{ path }`).
8. `moved-code`, `noise` — collapsed accordions; they let the reviewer skip what is not a change.
9. `open-questions` — what the change leaves unclear (also `openQuestions` on the page).
10. `reviewer-focus` — last: what to look at, most important first, each with an anchor.

A `risks` block, when the change carries risks worth a list of their own, goes before
`reviewer-focus`; each risk needs a `severity` (`high`, `medium`, `low`).

Leave out a block you cannot fill. Before writing each block, print its schema and follow it
exactly:

```bash
verstat schema <type>
```

## 4. Write `page.json`

`verstat schema page` is the page model. Write it outside the repo, e.g.
`<scratch>/verstat/pr-<n>/page.json`.

- `schema: "verstat.page/1"`, `skill: "explain-pr"`, `question`: e.g. “What does PR #<n> change
  and how to review it?”; `lang` only when the user asked for a language other than English.
- `repos`: `"<repo>": { "sha": <head>, "path": <head checkout> }` and
  `"<repo>@base": { "sha": <base>, "path": <base checkout> }`.
- **Anchors** `{ repo, path, find, nth? }`: `find` copied verbatim from the file at that side's
  sha, a distinctive piece of one line; `nth` (from 1) when it occurs more than once. What the
  change added or kept points into `<repo>`; what it removed, into `<repo>@base`. The page embeds
  every anchored file whole, so never anchor one that may hold secrets, and leave lock files and
  generated files without an anchor. No `find` anchors a whole file, `findEnd` a range, a list
  `find` several places in one file.
- **Provenance**: `source: inferred` for your own deduction (a guess at intent, a risk you
  reason about); `code` only for what the anchored line shows.

## 5. Write the route

`{ block, focus?, minutes, why, modes }`, first step the brief, last step `reviewer-focus`.

- `short` (“gist”): brief, claimed-vs-done and reviewer-focus, about 3 minutes (the validator
  rejects more than 5). `full` (“review”): every block worth reading. The page labels each mode with
  the sum of its steps' `minutes`.
- **One block is one step**: a block appears in the route once (the validator rejects a repeat).
- **Estimate only what is on the page**: a step's `minutes` is the time to read that block as the
  page shows it — for a layer, its `read` fragments, their notes and tests — never code that is
  not on the page. Do not add steps such as "read the production code" or "skim the tests".
- `focus` names the part a step is about (a claim, a commit, a file, fragment or note of a layer).

## 6. Validate

```bash
verstat validate <page.json>
```

Fix every `error:` line on stderr and repeat until exit 0. Reread every `inferred:` line: a wrong
anchor (fix it) or a real deduction (leave it — shown as “inferred”).

## 7. Build and hand over

```bash
verstat build <page.json> -o <page.html>
```

Check the exit code. Give the user the path of the HTML file; it opens from disk with no network.
Tell them it **embeds every file an anchor points into, whole**, plus the diffed lines (the footer
says so too) — think before forwarding it outside the people who may see that code.
