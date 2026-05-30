#!/usr/bin/env node
/**
 * Cards and Decks MCP — a local-first, read-only MCP server.
 *
 * Exposes a user's local Card Forge Cards, Stacks, Decks, and Receipts to
 * MCP-compatible agents (Claude Desktop and friends) over stdio.
 *
 * v0.1 boundary (see CLAIM_BOUNDARY.md):
 *   - read-only: no write/mutate tools
 *   - no network calls
 *   - no arbitrary shell execution
 *
 * IMPORTANT: stdout is the MCP transport. All human-readable logging goes to
 * stderr via console.error. Never console.log here.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { Store } from "./store.js";
import { buildContextPacket, suggestCardsForTask } from "./context.js";

const store = new Store();

const server = new McpServer({
  name: "cards-and-decks-mcp",
  version: "0.1.0",
});

/** Helper: wrap any JSON-serializable value as a single text content block. */
function jsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function jsonResource(uri: URL, value: unknown) {
  return {
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(value, null, 2) }],
  };
}

function notFound(uri: URL, message: string) {
  return {
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ error: message }, null, 2) }],
  };
}

// ===========================================================================
// Resources
// ===========================================================================

server.resource("cards-index", "cards://index", async (uri) => jsonResource(uri, await store.cardIndex()));

server.resource(
  "card",
  new ResourceTemplate("cards://card/{card_id}", { list: undefined }),
  async (uri, { card_id }) => {
    const card = await store.getCard(String(card_id));
    return card ? jsonResource(uri, card) : notFound(uri, `Card not found: ${card_id}`);
  },
);

server.resource("decks-index", "decks://index", async (uri) => jsonResource(uri, await store.deckIndex()));

server.resource(
  "deck",
  new ResourceTemplate("decks://deck/{deck_id}", { list: undefined }),
  async (uri, { deck_id }) => {
    const resolved = await store.getDeck(String(deck_id));
    return resolved ? jsonResource(uri, resolved) : notFound(uri, `Deck not found: ${deck_id}`);
  },
);

server.resource("stacks-index", "stacks://index", async (uri) => jsonResource(uri, await store.stackIndex()));

server.resource(
  "stack",
  new ResourceTemplate("stacks://stack/{stack_id}", { list: undefined }),
  async (uri, { stack_id }) => {
    const resolved = await store.getStack(String(stack_id));
    return resolved ? jsonResource(uri, resolved) : notFound(uri, `Stack not found: ${stack_id}`);
  },
);

server.resource("receipts-index", "receipts://index", async (uri) => jsonResource(uri, await store.receiptIndex()));

server.resource(
  "receipt",
  new ResourceTemplate("receipts://receipt/{receipt_id}", { list: undefined }),
  async (uri, { receipt_id }) => {
    const receipt = await store.getReceipt(String(receipt_id));
    return receipt ? jsonResource(uri, receipt) : notFound(uri, `Receipt not found: ${receipt_id}`);
  },
);

// ===========================================================================
// Tools (all read-only)
// ===========================================================================

server.tool(
  "list_cards",
  "List indexed Cards, optionally filtered by tag and/or trust label (generated|experimental|trusted).",
  { tag: z.string().optional(), trust: z.string().optional() },
  async ({ tag, trust }) => jsonContent(await store.cardIndex({ tag, trust })),
);

server.tool(
  "get_card",
  "Get one full Card by id, including its body.",
  { card_id: z.string() },
  async ({ card_id }) => {
    const card = await store.getCard(card_id);
    return card ? jsonContent(card) : jsonContent({ error: `Card not found: ${card_id}` });
  },
);

server.tool(
  "search_cards",
  "Keyword-search the Card index over title, tags, summary, and body. Ranking is transparent overlap, not a quality judgment.",
  { query: z.string(), limit: z.number().int().positive().max(50).optional() },
  async ({ query, limit }) => jsonContent(await store.searchCards(query, limit ?? 10)),
);

server.tool("list_decks", "List indexed Decks.", {}, async () => jsonContent(await store.deckIndex()));

server.tool(
  "get_deck",
  "Get one Deck by id, with its resolved Stacks and Cards.",
  { deck_id: z.string() },
  async ({ deck_id }) => {
    const resolved = await store.getDeck(deck_id);
    return resolved ? jsonContent(resolved) : jsonContent({ error: `Deck not found: ${deck_id}` });
  },
);

server.tool("list_stacks", "List indexed Stacks.", {}, async () => jsonContent(await store.stackIndex()));

server.tool(
  "get_stack",
  "Get one Stack by id, with its resolved Cards.",
  { stack_id: z.string() },
  async ({ stack_id }) => {
    const resolved = await store.getStack(stack_id);
    return resolved ? jsonContent(resolved) : jsonContent({ error: `Stack not found: ${stack_id}` });
  },
);

server.tool(
  "build_context_packet",
  "Assemble selected Cards into one text packet for an agent. Provide card_ids, or a stack_id, or a deck_id (most specific wins). Optional task string is included for framing.",
  {
    task: z.string().optional(),
    card_ids: z.array(z.string()).optional(),
    stack_id: z.string().optional(),
    deck_id: z.string().optional(),
  },
  async (args) => jsonContent(await buildContextPacket(store, args)),
);

server.tool(
  "suggest_cards_for_task",
  "Recommend Cards for a task description using transparent keyword search. Suggestions are not a safety or correctness judgment.",
  { task: z.string(), limit: z.number().int().positive().max(50).optional() },
  async ({ task, limit }) => jsonContent(await suggestCardsForTask(store, task, limit ?? 5)),
);

// ===========================================================================
// Prompts (templates the agent fills in; this server runs nothing itself)
// ===========================================================================

function userText(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

server.prompt(
  "draw_card_for_task",
  "Pick the best-fit Card for a task and explain why.",
  { task: z.string() },
  ({ task }) =>
    userText(
      `Use the Cards and Decks MCP tools to draw a Card for this task:\n\n"${task}"\n\n` +
        `Steps:\n1. Call suggest_cards_for_task with the task.\n2. Inspect top candidates with get_card.\n` +
        `3. Recommend ONE Card and explain the fit.\n` +
        `Remember: a Card being indexed/exposed says nothing about whether it is correct or safe. State the Card's trust label in your answer.`,
    ),
);

server.prompt(
  "run_card",
  "Apply a single Card's instructions to an input. The agent does the work; this server does not execute anything.",
  { card_id: z.string(), input: z.string().optional() },
  ({ card_id, input }) =>
    userText(
      `Load Card "${card_id}" with get_card, then follow its body as instructions.\n` +
        (input ? `Apply it to this input:\n\n${input}\n\n` : `Ask me for the input if the Card needs one.\n\n`) +
        `This server only reads the Card. You are responsible for performing and judging the result.`,
    ),
);

server.prompt(
  "build_stack_from_cards",
  "Draft a Stack grouping several Cards for a goal. Output is a proposal — v0.1 does not write it to disk.",
  { card_ids: z.string().describe("Comma-separated Card ids."), goal: z.string().optional() },
  ({ card_ids, goal }) =>
    userText(
      `Propose a Stack from these Cards: ${card_ids}.\n` +
        (goal ? `Goal: ${goal}\n` : "") +
        `Use get_card on each to confirm they exist and fit, then output a Stack object (id, title, summary, card_ids in order).\n` +
        `Note: this MCP server is read-only in v0.1 — it will not persist the Stack. Hand the JSON back to me to save via Card Forge.`,
    ),
);

server.prompt(
  "compile_deck_for_edge_runtime",
  "Plan a Deck compiled for a target runtime (e.g. edge). Produces a plan, not a written Deck.",
  { deck_id: z.string().optional(), target_runtime: z.string().optional() },
  ({ deck_id, target_runtime }) =>
    userText(
      `Plan a Deck${deck_id ? ` based on "${deck_id}" (load it with get_deck)` : ""} for target runtime "${target_runtime ?? "edge"}".\n` +
        `Identify which Stacks/Cards belong, flag any that are experimental/dev, and note runtime hints per Card.\n` +
        `Output the proposed Deck as JSON. This server will not write it (read-only v0.1).`,
    ),
);

server.prompt(
  "write_receipt",
  "Draft a Receipt describing what happened in a Run. v0.1 returns the Receipt text for YOU to save; it does not write to disk.",
  { card_id: z.string().optional(), status: z.string().optional(), summary: z.string().optional() },
  ({ card_id, status, summary }) =>
    userText(
      `Draft a Receipt as JSON with fields: id, kind, status, summary, card_id, agent, created (ISO-8601).\n` +
        (card_id ? `card_id: ${card_id}\n` : "") +
        (status ? `status: ${status}\n` : "") +
        (summary ? `summary: ${summary}\n` : "") +
        `Reminder: Cards and Decks MCP is read-only in v0.1. Output the Receipt JSON for me to persist via Card Forge — do not assume it was saved.`,
    ),
);

// ===========================================================================
// Boot
// ===========================================================================

async function main() {
  // Touch the store once so data problems surface on stderr at startup.
  const data = await store.load();
  console.error(
    `[cards-and-decks-mcp] data dir: ${data.dataDir} ` +
      `(cards=${data.cards.length}, stacks=${data.stacks.length}, decks=${data.decks.length}, receipts=${data.receipts.length})`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[cards-and-decks-mcp] ready on stdio. read-only v0.1.");
}

main().catch((err) => {
  console.error(`[cards-and-decks-mcp] fatal: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
