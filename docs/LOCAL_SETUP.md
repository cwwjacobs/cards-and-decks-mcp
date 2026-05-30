# Local Setup

How to point Cards and Decks MCP at your own Card Forge data and run it locally.

## Prerequisites

- Node.js 18+
- A folder of Card Forge JSON data (or use the bundled `examples/`)

## 1. Build

```bash
npm install
npm run build
```

## 2. Point it at your data

Set `CARDS_AND_DECKS_DATA` to an absolute path. If unset, the server reads the
packaged `examples/` folder.

```bash
export CARDS_AND_DECKS_DATA=/absolute/path/to/your/card-forge-data
```

Expected layout (one entity per `*.json` file):

```text
<data>/
  cards/      *.json
  stacks/     *.json
  decks/      *.json
  receipts/   *.json
```

Notes:
- The per-kind **index is derived** by scanning each folder. You do not write
  `index.json` by hand; any file named `index.json` is ignored.
- Missing subfolders are fine — they just mean "no entities of that kind."
- Files that fail to parse or validate are **skipped with a warning on stderr**,
  not fatal. The rest still load.
- Data is loaded once per process and cached. **Restart the server** to pick up
  new or edited files (v0.1 makes no live-reload claim).

## 3. Run

```bash
npm start
```

The server speaks MCP over stdio and waits for a client. On startup it logs the
resolved data dir and entity counts to **stderr** (stdout is reserved for the MCP
protocol):

```text
[cards-and-decks-mcp] data dir: /path/to/data (cards=4, stacks=2, decks=1, receipts=2)
[cards-and-decks-mcp] ready on stdio. read-only v0.1.
```

## 4. Connect a host (Claude Desktop)

See the README's "Example MCP client config" section. Use absolute paths for both
the server script and `CARDS_AND_DECKS_DATA`.

## Field reference

### Card (`cards/*.json`)

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | unique within the index |
| `title` | yes | |
| `summary` | no | one line |
| `tags` | no | string array, default `[]` |
| `trust` | no | `generated` \| `experimental` \| `trusted`, default `generated` |
| `runtime` | no | hint, e.g. `desktop`, `edge` |
| `inputs` | no | named inputs the Card expects |
| `body` | no | the Card's prompt/instructions (returned as text, never executed) |
| `source` | no | provenance |
| `version` | no | |
| `created` | no | ISO-8601 |

Extra fields are preserved (schemas are permissive).

### Stack (`stacks/*.json`)

`id`, `title`, `summary?`, `tags?`, `trust?`, `card_ids[]` (ordered), `source?`, `created?`.

### Deck (`decks/*.json`)

`id`, `title`, `summary?`, `tags?`, `trust?`, `target_runtime?`, `stack_ids[]`,
`card_ids[]`, `source?`, `created?`. A Deck's resolved Cards are the union of its
direct `card_ids` and the Cards in its `stack_ids`.

### Receipt (`receipts/*.json`)

`id`, `kind` (default `run`), `status?`, `summary?`, `card_id?`, `stack_id?`,
`deck_id?`, `run_id?`, `agent?`, `notes?`, `created?`. Read-only here — Receipts
are written by Card Forge, not by this server.

## Troubleshooting

- **Empty index / counts are 0** — check `CARDS_AND_DECKS_DATA` and the subfolder
  names (`cards`, `stacks`, `decks`, `receipts`).
- **A file isn't showing up** — look at stderr for a "skipped invalid/unreadable"
  line; the JSON probably failed to parse or is missing `id`/`title`.
- **Edits not appearing** — restart the server; data is cached per process.
