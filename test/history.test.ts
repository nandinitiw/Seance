// Unit tests for the "past chats" context layer (src/lib/history.ts).
// Runs against the in-process store (no REDIS_URL → Map), reusing memory.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SessionState, Archetype, Turn } from "../src/types.js";
import { recordSession, listSessions, getSession } from "../src/lib/history.js";
import { saveState } from "../src/lib/memory.js";

function makeState(
  objectKey: string,
  name: string,
  archetype: Archetype,
  history: Turn[] = [],
): SessionState {
  return {
    persona: {
      objectRecognized: true,
      archetype,
      objectKey,
      object: "a thing",
      name,
      tagline: "a tagline",
      openingLine: "well hello there",
      backstory: "a backstory",
      traits: ["x", "y"],
      voiceModel: "aura-2-thalia-en",
      voice: { model: "aura-2-thalia-en", rate: 1, pitch: 1, volume: 1, style: "neutral" },
      systemPrompt: "stay in character",
      portraitPrompt: "a portrait",
    },
    portraitUrl: "https://example.com/p.png",
    history,
    encounters: 1,
  };
}

test("recordSession then listSessions returns a matching summary", async () => {
  const state = makeState("hist-klamp", "Klamp", "grumpy_elder", [
    { role: "user", text: "hello" },
    { role: "assistant", text: "ugh, what now" },
  ]);
  await recordSession(state);

  const row = (await listSessions()).find((r) => r.objectKey === "hist-klamp");
  assert.ok(row, "session is indexed in the gallery");
  assert.equal(row.name, "Klamp");
  assert.equal(row.archetype, "grumpy_elder");
  assert.equal(row.turns, 2, "turn count reflects history length");
  assert.equal(row.lastMessage, "ugh, what now", "preview is the last line");
});

test("a never-chatted session previews its opening line", async () => {
  await recordSession(makeState("hist-fresh", "Fresh", "zen_guru"));
  const row = (await listSessions()).find((r) => r.objectKey === "hist-fresh");
  assert.ok(row);
  assert.equal(row.turns, 0);
  assert.equal(row.lastMessage, "well hello there");
});

test("listSessions is ordered most-recent-first", async () => {
  await recordSession(makeState("hist-older", "Older", "mob_boss"));
  await new Promise((r) => setTimeout(r, 12));
  await recordSession(makeState("hist-newer", "Newer", "surfer_dude"));

  const list = await listSessions();
  const older = list.findIndex((r) => r.objectKey === "hist-older");
  const newer = list.findIndex((r) => r.objectKey === "hist-newer");
  assert.ok(newer < older, "the more recently recorded session sorts first");
});

test("getSession returns the saved state, or null when unknown", async () => {
  const state = makeState("hist-get", "Gus", "surfer_dude", [{ role: "user", text: "yo" }]);
  await saveState(state);

  const got = await getSession("hist-get");
  assert.ok(got, "found the saved session");
  assert.equal(got.persona.name, "Gus");
  assert.equal(got.history.length, 1);

  assert.equal(await getSession("hist-does-not-exist"), null);
});
