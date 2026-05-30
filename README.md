# Cards and Decks MCP

A **local-first, read-only** [MCP](https://modelcontextprotocol.io) server that
lets local agents browse and use your local **Card Forge** Cards, Stacks, Decks,
Runs, and Receipts.

> v0.1 is read-only. No network calls. No shell execution. No write/mutate tools.
> See [`CLAIM_BOUNDARY.md`](./CLAIM_BOUNDARY.md).

## What this is

Cards and Decks MCP exposes the Card Forge data already on your machine to
MCP-compatible hosts (Claude Desktop and friends). An agent can:

- list, search, and read your **Cards**
- read your **Stacks** (ordered groups of Cards) and **Decks** (bundles aimed at
  a runtime)
- read **Receipts** (records of Runs)
- assemble a **context packet** from selected Cards to drop into its own context
- get **suggestions** of Cards for a task

It does this by reading JSON files from folders **you** control — nothing leaves
your machine.

## How it relates to Card Forge

These are **two separate repos** with separate jobs:

| Repo | Job |
| --- | --- |
| **Card-Forge** | makes / generates / organizes Cards, Stacks, Decks, Runs, and Receipts |
| **cards-and-decks-mcp** (this) | exposes your local Cards and Decks to agents through MCP |

This server **reads** what Card Forge produces. It does not generate or organize
Cards, and in v0.1 it does not write anything back. When a prompt here (e.g.
`write_receipt`) produces a Receipt, it hands you the JSON to save via Card Forge.

Card Forge does **not** require canonicalization. Your local MCP Card index is
simply your trusted working list — a recommended strategy, not a product rule.
Generated Cards are usable Cards.

## The v0.1 boundary

- **Local-first** — reads JSON from local folders you point it at.
- **Read-only** — no tool creates, edits, deletes, or persists anything.
- **No network** — zero outbound requests.
- **No shell** — Card bodies are returned as text; nothing is executed.

Full statement: [`CLAIM_BOUNDARY.md`](./CLAIM_BOUNDARY.md).

## Install & build

Requires Node.js 18+.

```bash
git clone https://github.com/cwwjacobs/cards-and-decks-mcp.git
cd cards-and-decks-mcp
npm install
npm run build
```

Run it directly (it speaks MCP over stdio, so it will just wait for a client):

```bash
npm start
# or, against your own data folder:
CARDS_AND_DECKS_DATA=/path/to/your/card-forge-data npm start
```

## Where it reads data from

Resolution order:

1. `CARDS_AND_DECKS_DATA` — absolute path to a data folder, if set.
2. The packaged `examples/` folder (used when the env var is unset).

### Example folder layout

```text
<your-data-folder>/
  cards/      *.json   # one Card per file
  stacks/     *.json   # one Stack per file
  decks/      *.json   # one Deck per file
  receipts/   *.json   # one Receipt per file
```

One entity per file. The index for each kind is **derived** by scanning the
folder — you do not maintain an `index.json` by hand (and any `index.json` is
ignored). See [`examples/`](./examples) for working files, and
[`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md) for the field reference.

## Example MCP client config (Claude Desktop)

Add to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "cards-and-decks": {
      "command": "node",
      "args": ["/absolute/path/to/cards-and-decks-mcp/build/server.js"],
      "env": {
        "CARDS_AND_DECKS_DATA": "/absolute/path/to/your/card-forge-data"
      }
    }
  }
}
```

Omit `env` to browse the bundled `examples/`. Restart Claude Desktop after
editing. The server logs its data dir and entity counts to stderr on startup.

## What it exposes

### Resources

| URI | Returns |
| --- | --- |
| `cards://index` | derived Card index |
| `cards://card/<card_id>` | one full Card |
| `decks://index` | derived Deck index |
| `decks://deck/<deck_id>` | one Deck + resolved Stacks & Cards |
| `stacks://index` | derived Stack index |
| `stacks://stack/<stack_id>` | one Stack + resolved Cards |
| `receipts://index` | derived Receipt index |
| `receipts://receipt/<receipt_id>` | one full Receipt |

### Tools (all read-only)

| Tool | What it does |
| --- | --- |
| `list_cards` | list Cards, optional `tag` / `trust` filter |
| `get_card` | one full Card by id |
| `search_cards` | transparent keyword search over title/tags/summary/body |
| `list_decks` | list Decks |
| `get_deck` | one Deck with resolved Stacks & Cards |
| `list_stacks` | list Stacks |
| `get_stack` | one Stack with resolved Cards |
| `build_context_packet` | assemble selected Cards into one text packet |
| `suggest_cards_for_task` | recommend Cards for a task (keyword ranking) |

### Prompts

`draw_card_for_task`, `run_card`, `build_stack_from_cards`,
`compile_deck_for_edge_runtime`, `write_receipt`. These return **templates the
agent fills in** — the server runs nothing and writes nothing in v0.1.

## Example usage

Once connected in Claude Desktop, ask things like:

- "List my trusted Cards." → `list_cards` with `trust: "trusted"`
- "Search my Cards for 'review'." → `search_cards`
- "Build a context packet from the `stack_review-pass` stack." → `build_context_packet`
- "Which Cards fit 'summarize a pull request'?" → `suggest_cards_for_task`
- "Draw a Card for triaging a finding." → the `draw_card_for_task` prompt

Or read a resource directly: `cards://card/card_summarize-diff`.

## Smoke test

```bash
npm run build
npm run smoke-test
```

This runs in-process logic checks against `examples/` **and** spawns the built
server to perform a real MCP stdio handshake (initialize → list tools / resources
/ prompts → call a tool → read a resource). It prints `SMOKE TEST PASSED` on
success.

## Trust & security notes

- **MCP exposure does not make a Card safe, correct, trusted, or production-ready.**
- Operators control which folders/indexes this server reads, and are responsible
  for what they expose.
- For a **shared/public MCP server**, prefer trusted/tested Cards. Experimental/dev
  Cards may be exposed if **clearly labeled**.
- The `trust` field is operator-supplied metadata, not a guarantee.

Full model: [`docs/TRUST_MODEL.md`](./docs/TRUST_MODEL.md) and
[`CLAIM_BOUNDARY.md`](./CLAIM_BOUNDARY.md).

## License

MIT — see [`LICENSE`](./LICENSE).
