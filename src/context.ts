/**
 * Pure, read-only helpers that compose Store data into agent-facing payloads.
 *
 * `build_context_packet` and `suggest_cards_for_task` live here so that both the
 * MCP server and the smoke test exercise the exact same logic. Nothing here
 * touches the network, the shell, or the filesystem beyond the read-only Store.
 */

import { Store } from "./store.js";
import { Card, CardIndexEntry, toCardIndexEntry } from "./schemas.js";

export interface ContextPacketInput {
  task?: string;
  card_ids?: string[];
  stack_id?: string;
  deck_id?: string;
}

export interface ContextPacket {
  task: string | null;
  included_cards: CardIndexEntry[];
  trust_summary: Record<string, number>;
  text: string;
  notes: string[];
}

/**
 * Assemble selected Cards into a single text packet an agent can drop into its
 * own context. Selection precedence (most specific first): explicit card_ids,
 * then a stack_id, then a deck_id. At least one selector should be provided.
 */
export async function buildContextPacket(store: Store, input: ContextPacketInput): Promise<ContextPacket> {
  const notes: string[] = [];
  let cards: Card[] = [];

  if (input.card_ids && input.card_ids.length > 0) {
    cards = await store.resolveCards(input.card_ids);
    const missing = input.card_ids.filter((id) => !cards.some((c) => c.id === id));
    if (missing.length) notes.push(`Unknown card_ids skipped: ${missing.join(", ")}`);
  } else if (input.stack_id) {
    const resolved = await store.getStack(input.stack_id);
    if (!resolved) notes.push(`Unknown stack_id: ${input.stack_id}`);
    else cards = resolved.cards;
  } else if (input.deck_id) {
    const resolved = await store.getDeck(input.deck_id);
    if (!resolved) notes.push(`Unknown deck_id: ${input.deck_id}`);
    else cards = resolved.cards;
  } else {
    notes.push("No selector provided. Pass card_ids, stack_id, or deck_id.");
  }

  const trust_summary: Record<string, number> = {};
  for (const c of cards) trust_summary[c.trust] = (trust_summary[c.trust] ?? 0) + 1;
  if ((trust_summary.experimental ?? 0) > 0) {
    notes.push(
      "This packet includes experimental/dev Cards. They are usable but unreviewed — inclusion here is not a trust signal.",
    );
  }

  const header =
    `# Context Packet\n` +
    (input.task ? `Task: ${input.task}\n` : "") +
    `Cards included: ${cards.length}\n` +
    `Trust mix: ${Object.entries(trust_summary).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}\n` +
    `\nNote: Exposure over MCP does not make any Card safe, correct, or production-ready.\n`;

  const sections = cards.map((c, i) => {
    const lines = [
      `## ${i + 1}. ${c.title}  [${c.id}]`,
      `trust: ${c.trust}${c.runtime ? ` | runtime: ${c.runtime}` : ""}${c.tags.length ? ` | tags: ${c.tags.join(", ")}` : ""}`,
    ];
    if (c.summary) lines.push(`summary: ${c.summary}`);
    if (c.inputs?.length) lines.push(`inputs: ${c.inputs.join(", ")}`);
    if (c.body) lines.push("", c.body);
    return lines.join("\n");
  });

  return {
    task: input.task ?? null,
    included_cards: cards.map(toCardIndexEntry),
    trust_summary,
    text: [header, ...sections].join("\n\n"),
    notes,
  };
}

export interface CardSuggestion {
  card: CardIndexEntry;
  score: number;
  why: string;
}

/** Recommend Cards for a task using the Store's transparent keyword search. */
export async function suggestCardsForTask(store: Store, task: string, limit = 5): Promise<{
  task: string;
  suggestions: CardSuggestion[];
  notes: string[];
}> {
  const hits = await store.searchCards(task, limit);
  const notes: string[] = [];
  if (hits.length === 0) {
    notes.push("No Cards matched. Try broader terms, or check that your Card index is populated.");
  }
  if (hits.some((h) => h.card.trust === "experimental")) {
    notes.push("Some suggestions are experimental/dev Cards. Review before relying on them.");
  }
  notes.push("Suggestions rank by keyword overlap only. They are not a judgment of correctness or safety.");
  return { task, suggestions: hits, notes };
}
