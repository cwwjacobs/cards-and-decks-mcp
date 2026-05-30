/**
 * Read-only, local-first store for Card Forge data.
 *
 * Hard boundaries (see CLAIM_BOUNDARY.md):
 *   - This module only ever READS the local filesystem.
 *   - No network calls. No shell execution. No writes/mutations.
 *
 * Data location resolution order:
 *   1. CARDS_AND_DECKS_DATA env var (absolute path to a data folder), if set.
 *   2. The packaged `examples/` folder shipped with this server.
 *
 * Expected layout under the data folder:
 *   <data>/cards/*.json
 *   <data>/stacks/*.json
 *   <data>/decks/*.json
 *   <data>/receipts/*.json
 *
 * Each *.json file holds one entity. Files that fail to parse or validate are
 * skipped with a warning to stderr (never stdout — stdout is the MCP channel).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  Card,
  CardSchema,
  Stack,
  StackSchema,
  Deck,
  DeckSchema,
  Receipt,
  ReceiptSchema,
  CardIndexEntry,
  toCardIndexEntry,
} from "./schemas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the data directory. Operators control this. */
export function resolveDataDir(): string {
  const fromEnv = process.env.CARDS_AND_DECKS_DATA;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv.trim());
  }
  // build/store.js -> ../examples
  return path.resolve(__dirname, "..", "examples");
}

async function readJsonDir(dir: string): Promise<unknown[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // Missing subfolder is fine — just means no entities of that kind.
    return [];
  }
  const out: unknown[] = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    if (name.toLowerCase() === "index.json") continue; // index is derived, not authored
    const full = path.join(dir, name);
    try {
      const raw = await fs.readFile(full, "utf8");
      out.push(JSON.parse(raw));
    } catch (err) {
      console.error(`[cards-and-decks-mcp] skipped unreadable file: ${full}: ${(err as Error).message}`);
    }
  }
  return out;
}

function validateMany<T>(
  raws: unknown[],
  parse: (raw: unknown) => { success: true; data: T } | { success: false; error: { message: string } },
  kind: string,
): T[] {
  const out: T[] = [];
  for (const raw of raws) {
    const res = parse(raw);
    if (res.success) {
      out.push(res.data);
    } else {
      console.error(`[cards-and-decks-mcp] skipped invalid ${kind}: ${res.error.message}`);
    }
  }
  return out;
}

export interface LoadedData {
  dataDir: string;
  cards: Card[];
  stacks: Stack[];
  decks: Deck[];
  receipts: Receipt[];
}

/**
 * The Store loads everything once on first access and caches it for the process
 * lifetime. Restart the server to pick up new/edited Cards (v0.1 is read-only and
 * makes no claim about live reloading).
 */
export class Store {
  readonly dataDir: string;
  private cache: LoadedData | null = null;

  constructor(dataDir = resolveDataDir()) {
    this.dataDir = dataDir;
  }

  async load(): Promise<LoadedData> {
    if (this.cache) return this.cache;

    const [cardRaws, stackRaws, deckRaws, receiptRaws] = await Promise.all([
      readJsonDir(path.join(this.dataDir, "cards")),
      readJsonDir(path.join(this.dataDir, "stacks")),
      readJsonDir(path.join(this.dataDir, "decks")),
      readJsonDir(path.join(this.dataDir, "receipts")),
    ]);

    this.cache = {
      dataDir: this.dataDir,
      cards: validateMany<Card>(cardRaws, (r) => CardSchema.safeParse(r), "card"),
      stacks: validateMany<Stack>(stackRaws, (r) => StackSchema.safeParse(r), "stack"),
      decks: validateMany<Deck>(deckRaws, (r) => DeckSchema.safeParse(r), "deck"),
      receipts: validateMany<Receipt>(receiptRaws, (r) => ReceiptSchema.safeParse(r), "receipt"),
    };
    return this.cache;
  }

  // ---- Cards -------------------------------------------------------------

  async cardIndex(filter?: { tag?: string; trust?: string }): Promise<CardIndexEntry[]> {
    const { cards } = await this.load();
    let list = cards;
    if (filter?.tag) {
      const tag = filter.tag.toLowerCase();
      list = list.filter((c) => c.tags.some((t) => t.toLowerCase() === tag));
    }
    if (filter?.trust) {
      const trust = filter.trust.toLowerCase();
      list = list.filter((c) => c.trust.toLowerCase() === trust);
    }
    return list.map(toCardIndexEntry);
  }

  async getCard(cardId: string): Promise<Card | undefined> {
    const { cards } = await this.load();
    return cards.find((c) => c.id === cardId);
  }

  /** Naive, transparent keyword scoring over title/summary/tags/body. */
  async searchCards(query: string, limit = 10): Promise<Array<{ card: CardIndexEntry; score: number; why: string }>> {
    const { cards } = await this.load();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const scored = cards.map((card) => {
      const title = card.title.toLowerCase();
      const summary = (card.summary ?? "").toLowerCase();
      const tags = card.tags.map((t) => t.toLowerCase());
      const body = (card.body ?? "").toLowerCase();
      let score = 0;
      const hits: string[] = [];
      for (const term of terms) {
        if (title.includes(term)) {
          score += 5;
          hits.push(`title~${term}`);
        }
        if (tags.some((t) => t.includes(term))) {
          score += 4;
          hits.push(`tag~${term}`);
        }
        if (summary.includes(term)) {
          score += 2;
          hits.push(`summary~${term}`);
        }
        if (body.includes(term)) {
          score += 1;
          hits.push(`body~${term}`);
        }
      }
      return { card: toCardIndexEntry(card), score, why: hits.join(", ") || "no match" };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ---- Stacks ------------------------------------------------------------

  async stackIndex(): Promise<Array<Pick<Stack, "id" | "title" | "summary" | "tags" | "trust"> & { card_count: number }>> {
    const { stacks } = await this.load();
    return stacks.map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      tags: s.tags,
      trust: s.trust,
      card_count: s.card_ids.length,
    }));
  }

  async getStack(stackId: string): Promise<{ stack: Stack; cards: Card[] } | undefined> {
    const { stacks } = await this.load();
    const stack = stacks.find((s) => s.id === stackId);
    if (!stack) return undefined;
    const cards = await this.resolveCards(stack.card_ids);
    return { stack, cards };
  }

  // ---- Decks -------------------------------------------------------------

  async deckIndex(): Promise<
    Array<Pick<Deck, "id" | "title" | "summary" | "tags" | "trust" | "target_runtime"> & { stack_count: number; card_count: number }>
  > {
    const { decks } = await this.load();
    return decks.map((d) => ({
      id: d.id,
      title: d.title,
      summary: d.summary,
      tags: d.tags,
      trust: d.trust,
      target_runtime: d.target_runtime,
      stack_count: d.stack_ids.length,
      card_count: d.card_ids.length,
    }));
  }

  async getDeck(deckId: string): Promise<{ deck: Deck; stacks: Stack[]; cards: Card[] } | undefined> {
    const { decks, stacks } = await this.load();
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return undefined;
    const deckStacks = stacks.filter((s) => deck.stack_ids.includes(s.id));
    const cardIds = new Set<string>(deck.card_ids);
    for (const s of deckStacks) for (const id of s.card_ids) cardIds.add(id);
    const cards = await this.resolveCards([...cardIds]);
    return { deck, stacks: deckStacks, cards };
  }

  // ---- Receipts ----------------------------------------------------------

  async receiptIndex(): Promise<Array<Pick<Receipt, "id" | "kind" | "status" | "summary" | "created">>> {
    const { receipts } = await this.load();
    return receipts.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      summary: r.summary,
      created: r.created,
    }));
  }

  async getReceipt(receiptId: string): Promise<Receipt | undefined> {
    const { receipts } = await this.load();
    return receipts.find((r) => r.id === receiptId);
  }

  // ---- Helpers -----------------------------------------------------------

  /** Resolve a list of card ids to full Cards, preserving order, skipping unknowns. */
  async resolveCards(cardIds: string[]): Promise<Card[]> {
    const { cards } = await this.load();
    const byId = new Map(cards.map((c) => [c.id, c]));
    const out: Card[] = [];
    for (const id of cardIds) {
      const c = byId.get(id);
      if (c) out.push(c);
    }
    return out;
  }
}
