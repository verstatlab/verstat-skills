# verstat-skills

Skills that answer a question about code with a **page** instead of text in the chat: one
self-contained HTML file with diagrams, a reading route, and code anchors. Every claim on the page
points at a line of code, and a validator checks each anchor against the repo at a pinned commit;
what it could not confirm is shown as a deduction (“inferred”), not as a fact. The file opens from
disk with no network.
[See example pages](https://verstatlab.github.io/verstat-skills/).

Shipped as a Claude Code plugin, with its own marketplace in the same repo.

## Skills

| Skill | Answers | Example |
|---|---|---|
| `explain` | How does X work, which states does it go through, where does a value come from, by which rules, when, what if it breaks, what is it made of — across services and repos | “How does checkout go through the services?” |
| `explain-pr` | What a pull request, branch or commit range changes and how to review it: claimed vs done, the commit graph, the touched behaviour before / after, the documentation, the code in layers with the test of each fragment, moved code and noise set aside, where to look first | “Explain PR #2466 for review” |

Each skill picks the blocks that fit the question (system map, sequence, state machine, decision
table, data lineage, failure modes, …), writes a `page.json`, validates it, and builds the HTML.

Pages are in English by default. To get one in another language, say so in the question (“…, in
Ukrainian”): the skill writes the texts in that language and the page UI follows for the
languages verstat has a UI dictionary for (English and Ukrainian); for any other language the UI
stays English. Adding a UI language is one file, `locales/<lang>.json`.

## Examples

Pages built by the skills, published at https://verstatlab.github.io/verstat-skills/:

- **explain** — how a request travels through Express 5: `app.use` middleware, the router and the
  error handler (expressjs/express v5.3.0, pillarjs/router, pillarjs/finalhandler).
- **explain-pr** — Vite PR #20260, `import.meta.resolve` in the module runner.
- **showcase** — every block type on one page, on a small made-up service.

The pages are in `examples/`; what they were built from is in `examples/src/<name>/`: the
`page.json` (with the question and the pinned commits) and, for the showcase, its code as
`patches/`. `npm run examples` rebuilds them (see **Local development**).

## Requirements

- **Node.js 18 or newer, or Deno, or Bun — required.** The engine that validates and builds the
  page is a JavaScript file; without a runtime the skills stop and tell you what to install. No
  `npm install` is needed: the engine has no dependencies.
- `git`, and a clean working tree in the repos you ask about (anchors are read at a pinned
  commit; uncommitted changes would make them unreliable).

## Install

Requires Claude Code — the skills call the engine through `${CLAUDE_PLUGIN_ROOT}`; other agents are
not supported yet.

```bash
claude plugin marketplace add verstatlab/verstat-skills
claude plugin install verstat-skills@verstat
```

Then ask the question, or call a skill directly: `/verstat-skills:explain`,
`/verstat-skills:explain-pr`. Installed copies update when the plugin's `version` changes.

## The page contains your code

A built page embeds the code it explains (every file an anchor points into, whole), so it can
be read without access to the repos. Its footer says so: “Contains code (whole files) from <repo>.”
Think before forwarding the file to anyone who may not see that code.

## Local development

```bash
claude --plugin-dir .            # load the plugin from this checkout for one session
claude plugin validate .         # check plugin.json, marketplace.json and every SKILL.md
npm test                         # engine, client contracts and every block type
npm run build                    # rebuild bin/verstat.mjs from src/ (never edit bin/ by hand)
npm run examples [name…]         # rebuild examples/*.html from examples/src/ (clones the pinned repos)
node bin/verstat.mjs schema <type>   # a block type's schema
```

After a change to `src/`, `client/`, `components/`, `locales/` or `vendor/`, run `npm run examples`
and commit the rebuilt pages: the Pages site publishes them as committed.

A new block type is a new folder under `components/`; the engine and the validator do not change.

## Layout

```
.claude-plugin/plugin.json        plugin manifest
.claude-plugin/marketplace.json   marketplace "verstat" listing this plugin
skills/explain/SKILL.md           the explain skill
skills/explain-pr/SKILL.md        the explain-pr skill
components/<type>/                one block type: schema.json, render.js, meta.json
client/                           the code every page shares: shell, route, anchors, glossary, themes
locales/                          page UI strings: en.json (the reference) and one file per language
vendor/                           pinned libraries and fonts, with checksums and licences
src/                              engine source
bin/verstat.mjs                   the built engine
docs/                             design and reference
examples/                         the example pages and their index, published to GitHub Pages
examples/src/<name>/              what each example is built from: page.json, patches/ (showcase)
scripts/examples.mjs              rebuilds the examples (npm run examples)
.github/workflows/pages.yml       publishes examples/*.html to GitHub Pages on push to main
.github/workflows/ci.yml          runs npm test and plugin validation on pull requests and main
CONTRIBUTING.md                   how to contribute: issues, pull requests, CI
```

## Design decisions

- **Diagrams on React Flow.** The system map, dependency graph and state machine use vendored React Flow (laid out by dagre) for drag, fit and controlled zoom; edges follow dagre's routes, so no edge crosses a node and labels keep the room dagre reserved; only pages with one of these blocks carry React (about +330 KB), the rest stay plain JS.
- **Whole files in the code drawer.** Every file an anchor points into is embedded whole, with no size limit, so the drawer works offline; the cost is page size, so never anchor a large or secret-holding file.
- **Example pages ship with the plugin.** `examples/` (about 2 MB of built pages) sits in the
  repository root, which is also the plugin's source, so installs carry it; the skills never read
  it. It stays there so the Pages workflow publishes exactly what is committed.
- **Change fragments come from git.** In the `changes` block the agent gives only a fragment's bounds, the engine takes the diff lines from git, and every changed line outside moved code and noise must sit in exactly one fragment.

## Docs

- [docs/design.md](docs/design.md) — what the skills do and why: blocks, page model, validation.
- [docs/engine.md](docs/engine.md) — the engine: commands, anchors, diff facts, build output.
- [docs/client.md](docs/client.md) — the page client and what a block's render can use.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute: issues, pull requests, CI.

## License

[MIT](LICENSE) © Verstat Lab
