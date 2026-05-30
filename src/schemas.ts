/**
 * Schemas for the local Card Forge data this MCP server reads.
 *
 * These describe what Cards and Decks MCP *expects to find on disk*. They are
 * deliberately permissive: every schema uses `.passthrough()` so that extra
 * fields written by Card Forge (or by you) survive intact. This server never
 * mutates these objects — it only reads, validates loosely, and exposes them.
 *
 * `trust` is a label set by whoever wrote the Card. It is descriptive metadata,
 * not a guarantee. See CLAIM_BOUNDARY.md.
 */

import { z } from "zod";

/**
 * Trust label carried by a Card. This is operator-supplied metadata only.
 * Exposing a Card over MCP does NOT make it safe, correct, or production-ready,
 * regardless of this label.
 *
 *  - "generated"    : a generated Card. Usable, but unreviewed by default.
 *  - "experimental" : an experimental/dev Card. Expose only if clearly labeled.
 *  - "trusted"      : a Card you have tested and chosen to rely on locally.
 */
export const TrustLevel = z
  .enum(["generated", "experimental", "trusted"])
  .describe("Operator-supplied trust label. Descriptive only, not a guarantee.");
export type TrustLevel = z.infer<typeof TrustLevel>;

/** A single Card: the smallest reusable unit of intent in Card Forge. */
export const CardSchema = z
  .object({
    id: z.string().describe("Stable Card id, unique within the Card index."),
    title: z.string(),
    summary: z.string().optional().describe("One-line description of what this Card is for."),
    tags: z.array(z.string()).default([]),
    trust: TrustLevel.default("generated"),
    runtime: z.string().optional().describe("Hint about where this Card is meant to run, e.g. 'edge', 'desktop'."),
    inputs: z.array(z.string()).optional().describe("Named inputs this Card expects, if any."),
    body: z.string().optional().describe("The Card's prompt / instructions / payload."),
    source: z.string().optional().describe("Where this Card came from, e.g. 'card-forge', a path, or a person."),
    version: z.string().optional(),
    created: z.string().optional().describe("ISO-8601 timestamp."),
  })
  .passthrough();
export type Card = z.infer<typeof CardSchema>;

/** A Stack: an ordered grouping of Cards that belong together. */
export const StackSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    trust: TrustLevel.default("generated"),
    card_ids: z.array(z.string()).default([]).describe("Cards in this Stack, in order."),
    source: z.string().optional(),
    created: z.string().optional(),
  })
  .passthrough();
export type Stack = z.infer<typeof StackSchema>;

/** A Deck: a compiled bundle of Stacks and/or Cards, often aimed at a runtime. */
export const DeckSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    trust: TrustLevel.default("generated"),
    target_runtime: z.string().optional().describe("Runtime this Deck is compiled for, e.g. 'edge'."),
    stack_ids: z.array(z.string()).default([]),
    card_ids: z.array(z.string()).default([]),
    source: z.string().optional(),
    created: z.string().optional(),
  })
  .passthrough();
export type Deck = z.infer<typeof DeckSchema>;

/** A Receipt: a record that something happened (a Run, a build, a draw). Read-only here. */
export const ReceiptSchema = z
  .object({
    id: z.string(),
    kind: z.string().default("run").describe("e.g. 'run', 'build', 'draw'."),
    status: z.string().optional().describe("e.g. 'ok', 'error', 'partial'. Free-form."),
    summary: z.string().optional(),
    card_id: z.string().optional(),
    stack_id: z.string().optional(),
    deck_id: z.string().optional(),
    run_id: z.string().optional(),
    agent: z.string().optional().describe("Who/what produced this Receipt."),
    notes: z.string().optional(),
    created: z.string().optional(),
  })
  .passthrough();
export type Receipt = z.infer<typeof ReceiptSchema>;

/** Lightweight index entry derived from a full Card for `cards://index` / list_cards. */
export interface CardIndexEntry {
  id: string;
  title: string;
  summary?: string;
  tags: string[];
  trust: TrustLevel;
  runtime?: string;
}

export function toCardIndexEntry(card: Card): CardIndexEntry {
  return {
    id: card.id,
    title: card.title,
    summary: card.summary,
    tags: card.tags,
    trust: card.trust,
    runtime: card.runtime,
  };
}
