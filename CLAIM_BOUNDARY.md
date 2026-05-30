# Claim Boundary

This document states exactly what Cards and Decks MCP **does** and **does not**
claim. Read it before exposing any Card index to an agent.

## What v0.1 is

A local-first, **read-only** MCP server that reads local Card Forge data
(Cards, Stacks, Decks, Receipts) from folders you control and exposes them to
MCP-compatible agents over stdio.

## Hard boundaries in v0.1

- **Read-only.** There are no write or mutate tools. The server never creates,
  edits, deletes, moves, or persists any Card, Stack, Deck, or Receipt.
- **No network calls.** The server makes no outbound network requests. It reads
  the local filesystem and speaks MCP over stdio. Nothing leaves the machine
  because of this server.
- **No arbitrary shell execution.** The server does not run shell commands,
  scripts, or Card "bodies." A Card's body is returned as text for an agent to
  read; this server executes nothing.
- **No write/mutate tools yet.** Prompts like `run_card`, `build_stack_from_cards`,
  `compile_deck_for_edge_runtime`, and `write_receipt` produce **text proposals
  for you to save via Card Forge**. They do not write to disk in v0.1.

## What a PASS / exposure means — and does not mean

- **MCP exposure does not imply trust.** A Card being indexed, listed, searched,
  or returned by this server says **nothing** about whether that Card is safe,
  correct, tested, or production-ready.
- The `trust` label on a Card (`generated` | `experimental` | `trusted`) is
  **operator-supplied descriptive metadata**, not a guarantee. A Card labeled
  `trusted` is trusted *by whoever labeled it*, under their own testing — not by
  this server.
- Search and suggestion ranking reflect **keyword overlap only**. They are not a
  judgment of quality, correctness, or safety.

## No guarantees

This software is provided "as is," with **no warranty** and **no safety or
correctness guarantees** of any kind (see `LICENSE`). It does not validate that
Cards behave as described, that Receipts are accurate, or that any output is fit
for any purpose.

## Operator responsibility

- **Operators are responsible for what they expose.** You choose which folders
  and indexes this server reads (`CARDS_AND_DECKS_DATA`). Anything readable in
  those folders may be surfaced to a connected agent.
- For a **shared/public MCP server**, prefer trusted/tested Cards. You *may*
  expose experimental/dev Cards if they are **clearly labeled** as such.
- Card Forge does **not** require canonicalization. Your local MCP Card index can
  be treated as your trusted working list — that is a recommended strategy, not a
  mandatory rule.

See `docs/TRUST_MODEL.md` for the full trust model and recommendations.
