# Cards and Decks MCP showcase guide

## One-line portfolio description

Cards and Decks MCP is a local-first, read-only Model Context Protocol server that lets compatible AI hosts browse structured Cards, Stacks, Decks, Runs, and Receipts stored in operator-controlled folders.

## Why this project belongs in a portfolio

This repository demonstrates a real MCP server with a narrow security boundary and testable behavior:

- Node.js and TypeScript MCP server
- stdio transport
- resources, tools, and prompts
- local folder-backed JSON data
- read-only operation
- no network calls
- no shell execution
- transparent keyword ranking for suggestions
- end-to-end MCP handshake smoke test

## 90-second demo

```bash
npm install
npm run build
npm run smoke-test
```

Then connect it to an MCP-compatible host and show:

1. `list_cards`
2. `search_cards` with a clear keyword
3. `get_deck` resolving its Stacks and Cards
4. `build_context_packet`
5. a resource read such as `cards://card/card_summarize-diff`

## Screenshot and recording shot list

Capture these views:

1. terminal showing `SMOKE TEST PASSED`
2. MCP host listing the server's resources and tools
3. a `search_cards` result
4. a resolved Deck containing ordered Stacks and Cards
5. generated context packet
6. example folder tree with `cards/`, `stacks/`, `decks/`, and `receipts/`

Use the bundled examples or synthetic data. Do not expose proprietary prompts, private Cards, client Receipts, or secrets embedded in local files.

## Proof points to mention

- the server reads files from folders selected by the operator
- v0.1 exposes no mutation tools
- the smoke test performs a real stdio initialize and call sequence
- indexes are derived from files rather than maintained as hidden state
- trust labels are metadata supplied by the operator, not a safety guarantee

## Honest boundaries

MCP exposure does not make an artifact correct, safe, or trusted. The host decides how returned text is used. This server provides access and context assembly; it does not execute Card bodies or write changes back to disk.

## Suggested GitHub description

> Read-only MCP server for browsing local Cards, Decks, context packets, workflows, and receipts.

## Suggested topics

`model-context-protocol` `mcp-server` `typescript` `ai-agents` `local-first` `context-management` `read-only` `stdio`

## Suggested pinned-repository caption

> Give MCP-compatible agents inspectable access to local reusable capabilities without granting network, shell, or write authority.
