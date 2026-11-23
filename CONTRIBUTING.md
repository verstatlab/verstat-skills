# Contributing

## Issues are the tracker

Every change starts as an issue: a bug report, a proposal, or a piece of planned work. One issue
describes one change: what is wrong or missing, and how to tell it is done.

## One branch and one pull request per issue

- Branch off `main`, one branch per issue.
- Open the pull request into `main` as a **draft** while the work is in progress and mark it ready
  for review when it is done.
- Keep the title and description short and in English. The description says what changes and ends
  with `Closes #N` for its issue, so merging the pull request closes the issue.
- A pull request carries only its own change: no unrelated fixes, no rebuilt files that the change
  does not need.

## CI

Every pull request and every push to `main` runs [CI](.github/workflows/ci.yml):

- `npm test` on Node 18, 20 and 22 — the engine, the client contracts, every block type, and the
  check that `bin/verstat.mjs` is the current build of `src/`;
- `claude plugin validate .` — the plugin and marketplace manifests and every `SKILL.md`.

The `ci` check passes only when all of these pass, and `main` is protected: a pull request
merges only when `ci` is green.

## Before you push

Run the gates from [Local development](README.md#local-development):

```bash
claude plugin validate .
npm test
```

- After a change to `src/`, run `npm run build` and commit the rebuilt `bin/verstat.mjs`.
- After a change to `src/`, `client/`, `components/`, `locales/` or `vendor/`, run
  `npm run examples` and commit the rebuilt pages: the Pages site publishes them as committed.
