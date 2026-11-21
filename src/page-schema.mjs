export const PAGE_SCHEMA_ID = 'verstat:page';
export const SHA_PATTERN = '^(?:[0-9a-f]{7,40}|[0-9a-f]{64})$';

export const pageSchema = {
  $id: PAGE_SCHEMA_ID,
  title: 'verstat page',
  description:
    'One page: the question it answers, the repositories its anchors point into, and the blocks that answer it. Each block is checked further by the schema of its type (`verstat schema <type>`).',
  type: 'object',
  required: ['schema', 'skill', 'question', 'repos', 'blocks'],
  additionalProperties: false,
  properties: {
    schema: { const: 'verstat.page/1' },
    skill: { type: 'string', minLength: 1, description: 'The skill that produced the page.' },
    question: { type: 'string', minLength: 1, description: 'The question the page answers.' },
    lang: {
      type: 'string',
      pattern: '^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$',
      default: 'en',
      description:
        'The language the page texts are written in, as a BCP 47 tag (`en`, `uk`, `de`, `pt-BR`). Sets `<html lang>` and the language of the page UI; a language verstat has no UI dictionary for gets the English UI. Default `en`.',
    },
    repos: {
      type: 'object',
      description: 'Every repository anchors point into, by the name anchors use in `repo`.',
      additionalProperties: { $ref: '#/$defs/repo' },
    },
    glossary: { type: 'array', items: { $ref: '#/$defs/glossaryEntry' } },
    blocks: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/block' },
    },
    route: { type: 'array', items: { $ref: '#/$defs/routeStep' } },
    openQuestions: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
  $defs: {
    repo: {
      type: 'object',
      required: ['sha'],
      additionalProperties: false,
      properties: {
        remote: { type: 'string' },
        sha: { type: 'string', pattern: SHA_PATTERN, description: 'The commit every anchor into this repo is read at.' },
        path: {
          type: 'string',
          minLength: 1,
          description: 'Local checkout of the repo: absolute, or relative to the page file. Overridden by `--repo <name>=<dir>`; defaults to the page file\'s directory.',
        },
      },
    },
    anchor: {
      type: 'object',
      description:
        'A place in code, read at the sha `repos.<repo>` pins: the whole file `path` (no `find`), the line(s) where `find` occurs, the range from `find` to `findEnd`, or several places when `find` is a list.',
      'x-anchor': true,
      required: ['repo', 'path'],
      additionalProperties: false,
      properties: {
        repo: { type: 'string', minLength: 1, description: 'A key of the page\'s `repos`.' },
        path: { type: 'string', minLength: 1, description: 'File path from the repo root.' },
        find: {
          description: 'Exact text that occurs in the file (may span lines), or a list of such texts for several places in the same file. Leave it out to anchor the whole file.',
          oneOf: [
            { type: 'string', minLength: 1 },
            { type: 'array', minItems: 2, items: { $ref: '#/$defs/anchorPlace' } },
          ],
        },
        nth: { type: 'integer', minimum: 1, description: 'Which occurrence of a single `find`, counting from 1; required when it occurs more than once.' },
        findEnd: {
          type: 'string',
          minLength: 1,
          description: 'With a single `find`: exact text that ends a range. Its first occurrence after the match of `find` is the range\'s last line.',
        },
      },
    },
    anchorPlace: {
      description: 'One place of a list `find`: the text, or `{ find, nth }` when the text occurs more than once.',
      oneOf: [
        { type: 'string', minLength: 1 },
        {
          type: 'object',
          required: ['find'],
          additionalProperties: false,
          properties: {
            find: { type: 'string', minLength: 1 },
            nth: { type: 'integer', minimum: 1 },
          },
        },
      ],
    },
    source: {
      enum: ['code', 'test', 'adr', 'doc', 'inferred'],
      description: 'Where a claim comes from. `inferred` is shown as a deduction, not a fact.',
    },
    change: {
      enum: ['added', 'removed', 'changed'],
      description: 'Diff mode: what happened to this part between the base and the head. A `changed` part may carry `before` with its old values.',
    },
    glossaryEntry: {
      type: 'object',
      required: ['term', 'definition'],
      additionalProperties: false,
      properties: {
        term: { type: 'string', minLength: 1 },
        code: { type: 'string', minLength: 1, description: 'The identifier the term goes by in code, shown next to it.' },
        aliases: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Other forms of the term the page text uses (inflections, plurals); they are highlighted too.',
        },
        definition: { type: 'string', minLength: 1 },
        anchor: { $ref: '#/$defs/anchor' },
        source: { $ref: '#/$defs/source' },
      },
    },
    block: {
      type: 'object',
      required: ['id', 'type'],
      properties: {
        id: { type: 'string', minLength: 1, description: 'Unique on the page; the route addresses blocks by it.' },
        type: { type: 'string', minLength: 1, description: 'A block type; `verstat schema <type>` prints its schema.' },
        title: { type: 'string' },
      },
    },
    routeStep: {
      type: 'object',
      required: ['block', 'minutes', 'why', 'modes'],
      additionalProperties: false,
      properties: {
        block: { type: 'string', minLength: 1, description: 'The `id` of a block on the page.' },
        focus: { type: 'string', minLength: 1, description: 'The `id` of a part inside that block.' },
        minutes: { type: 'number', minimum: 0 },
        why: { type: 'string', minLength: 1 },
        modes: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { enum: ['short', 'full'] },
        },
      },
    },
  },
};
