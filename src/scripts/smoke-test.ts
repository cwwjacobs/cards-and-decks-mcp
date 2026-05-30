/**
 * Smoke test for Cards and Decks MCP.
 *
 * Two layers:
 *   1. In-process logic check  — loads the Store from examples/ and exercises the
 *      same helpers the tools use (index, get, search, build_context_packet, suggest).
 *   2. Protocol check          — spawns build/server.js and performs a real MCP
 *      stdio JSON-RPC handshake (initialize -> list tools/resources/prompts ->
 *      call a tool -> read a resource).
 *
 * Exits 0 on success, 1 on any failure. Human output goes to stderr; the final
 * one-line verdict goes to stdout.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Store } from "../store.js";
import { buildContextPacket, suggestCardsForTask } from "../context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "..", "server.js"); // build/server.js

let failures = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.error(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function logicChecks(): Promise<void> {
  console.error("\n[1/2] in-process logic checks");
  const store = new Store(); // defaults to packaged examples/
  const data = await store.load();
  check("examples load", data.cards.length > 0, `cards=${data.cards.length}`);
  check("stacks present", data.stacks.length > 0, `stacks=${data.stacks.length}`);
  check("decks present", data.decks.length > 0, `decks=${data.decks.length}`);
  check("receipts present", data.receipts.length > 0, `receipts=${data.receipts.length}`);

  const index = await store.cardIndex();
  check("card index non-empty", index.length === data.cards.length);

  const first = data.cards[0];
  const got = await store.getCard(first.id);
  check("get_card round-trips", got?.id === first.id);

  const search = await store.searchCards(first.title.split(/\s+/)[0] ?? first.id);
  check("search finds something", search.length > 0);

  const packet = await buildContextPacket(store, { card_ids: data.cards.slice(0, 2).map((c) => c.id), task: "smoke" });
  check("context packet built", packet.included_cards.length > 0 && packet.text.includes("Context Packet"));

  const suggest = await suggestCardsForTask(store, data.cards[0].summary ?? data.cards[0].title);
  check("suggest returns notes", suggest.notes.length > 0);

  // Trust boundary stays descriptive, never a guarantee.
  check("trust labels valid", data.cards.every((c) => ["generated", "experimental", "trusted"].includes(c.trust)));
}

// --- tiny newline-delimited JSON-RPC client over the server's stdio ---------

interface RpcResult {
  id: number;
  result?: any;
  error?: any;
}

async function protocolChecks(): Promise<void> {
  console.error("\n[2/2] MCP stdio protocol handshake");
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });

  child.stderr.on("data", (b) => process.stderr.write(`  [server] ${b}`));

  const pending = new Map<number, (r: RpcResult) => void>();
  let buf = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof msg.id === "number" && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    }
  });

  function send(obj: unknown): void {
    child.stdin.write(JSON.stringify(obj) + "\n");
  }
  function request(id: number, method: string, params: unknown = {}): Promise<RpcResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method} (id ${id})`)), 8000);
      pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      send({ jsonrpc: "2.0", id, method, params });
    });
  }

  try {
    const init = await request(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "0.0.0" },
    });
    check("initialize ok", !!init.result?.serverInfo, JSON.stringify(init.error ?? {}));
    check("server identifies itself", init.result?.serverInfo?.name === "cards-and-decks-mcp");

    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

    const tools = await request(2, "tools/list");
    const toolNames: string[] = (tools.result?.tools ?? []).map((t: any) => t.name);
    const expectedTools = [
      "list_cards", "get_card", "search_cards", "list_decks", "get_deck",
      "list_stacks", "get_stack", "build_context_packet", "suggest_cards_for_task",
    ];
    check("all 9 tools present", expectedTools.every((t) => toolNames.includes(t)), `got: ${toolNames.join(",")}`);

    const resources = await request(3, "resources/list");
    const resUris: string[] = (resources.result?.resources ?? []).map((r: any) => r.uri);
    check("index resources present", ["cards://index", "decks://index", "stacks://index", "receipts://index"].every((u) => resUris.includes(u)), resUris.join(","));

    const prompts = await request(4, "prompts/list");
    const promptNames: string[] = (prompts.result?.prompts ?? []).map((p: any) => p.name);
    const expectedPrompts = ["draw_card_for_task", "run_card", "build_stack_from_cards", "compile_deck_for_edge_runtime", "write_receipt"];
    check("all 5 prompts present", expectedPrompts.every((p) => promptNames.includes(p)), promptNames.join(","));

    const callList = await request(5, "tools/call", { name: "list_cards", arguments: {} });
    const listText = callList.result?.content?.[0]?.text ?? "";
    check("list_cards returns cards", listText.includes("\"id\""), listText.slice(0, 80));

    const readIndex = await request(6, "resources/read", { uri: "cards://index" });
    check("cards://index readable", !!readIndex.result?.contents?.[0]?.text, JSON.stringify(readIndex.error ?? {}));
  } finally {
    child.kill("SIGTERM");
  }
}

async function main(): Promise<void> {
  console.error("cards-and-decks-mcp smoke test");
  await logicChecks();
  await protocolChecks();

  if (failures === 0) {
    process.stdout.write("SMOKE TEST PASSED\n");
    process.exit(0);
  } else {
    process.stdout.write(`SMOKE TEST FAILED (${failures} check(s))\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`smoke test crashed: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
