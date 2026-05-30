# Trust Model

This is the recommended way to think about trust when running Cards and Decks
MCP. For the hard, non-negotiable boundaries, see
[`CLAIM_BOUNDARY.md`](../CLAIM_BOUNDARY.md).

## First principle

> **MCP exposure does not make a Card safe, correct, trusted, or production-ready.**

Listing, searching, returning, or bundling a Card through this server is a
*plumbing* act. It moves bytes you already have into an agent's reach. It makes
no claim about the Card's quality.

## Operators control what gets exposed

You decide which folders and indexes this server reads, via
`CARDS_AND_DECKS_DATA`. Anything readable under that folder may be surfaced to a
connected agent. Treat the data folder as the exposure boundary:

- Keep private or half-baked Cards **out** of the exposed folder, or
- Keep them in, but **label them clearly** (see below).

**Operators are responsible for what they expose.**

## Trust labels are descriptive, not guarantees

Each Card carries a `trust` label set by whoever wrote it:

| Label | Meaning | Recommended exposure |
| --- | --- | --- |
| `trusted` | you have tested it and choose to rely on it locally | fine for shared/public MCP servers |
| `generated` | a generated Card; usable, but unreviewed by default | fine locally; review before shared reliance |
| `experimental` | an experimental/dev Card | expose only if **clearly labeled** |

The label describes the *author's* posture. It is **not** a verification by this
server. `suggest_cards_for_task` and `build_context_packet` surface the trust mix
so an agent (and you) can see what's in play, but surfacing it is not endorsing
it.

## Shared / public MCP servers

If you run this where others (or shared agents) can reach it:

- **Prefer trusted/tested Cards.**
- You **may** expose experimental/dev Cards — but keep them clearly labeled as
  `experimental` so nobody mistakes them for relied-upon work.
- Remember every Card body is readable text to the connected agent.

## Your local index as a working list

Your local MCP Card index can be treated as your **trusted working list** — the
set of Cards you actually reach for. This is a **recommended strategy, not a
mandatory product rule**.

Specifically, Card Forge does **not** require canonicalization. There is:

- no required "promote to canon" step,
- no canon ledger you must maintain,
- no notion that a generated Card is a mere "candidate" until blessed.

Generated Cards are usable Cards. Curate by choosing what lands in your exposed
folder and how you label it — not by a mandatory canonicalization pipeline.

## What this server will not do (v0.1)

- It will not execute a Card body or any shell command.
- It will not make network calls.
- It will not write, edit, or delete your Cards, Stacks, Decks, or Receipts.

So the trust surface is bounded: the worst a connected agent can do *through this
server* is **read** what you put in the exposed folder. What the agent then does
with that text is between you and the agent.
