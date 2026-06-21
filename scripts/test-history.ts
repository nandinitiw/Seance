// Unit tests for the history feature's backend logic (memory index + the
// /api/history summary shape). Hermetic: forces the in-process Map path so it
// never touches a real Redis, needs no API keys, and is deterministic.
//   run: npm run test:history
import assert from "node:assert/strict";

// Force the in-memory store BEFORE importing memory.ts (which reads config/env
// at import time). dotenv does not override an already-set var, so this wins.
process.env.REDIS_URL = "";

const { saveState, loadState, listStates } = await import("../src/lib/memory.js");
type SessionState = Awaited<ReturnType<typeof loadState>> & {};

function fakeState(key: string, encounters: number, turns: number): SessionState {
  const history = Array.from({ length: turns }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    text: `turn ${i}`,
  }));
  return {
    persona: {
      objectKey: key,
      object: `a ${key}`,
      name: `Name ${key}`,
      tagline: "a tagline",
      backstory: "a backstory",
      traits: ["x"],
      voiceModel: "aura-2-thalia-en",
      systemPrompt: "sp",
      portraitPrompt: "pp",
    },
    portraitUrl: "data:image/png;base64,xxx",
    history,
    encounters,
  } as SessionState;
}

// Mirrors the /api/history summary logic in server.ts (sort + lastMessage pick).
function summarize(states: SessionState[]) {
  return states
    .map((s) => ({
      objectKey: s.persona.objectKey,
      encounters: s.encounters,
      turnCount: s.history.length,
      lastMessage:
        [...s.history].reverse().find((t) => t.role === "assistant")?.text ??
        s.persona.tagline,
    }))
    .sort((a, b) => b.encounters - a.encounters || b.turnCount - a.turnCount);
}

let n = 0;
const it = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  n++;
  console.log(`  ✓ ${name}`);
};

await it("listStates() starts empty", async () => {
  assert.deepEqual(await listStates(), []);
});

await it("saveState then listStates returns the object", async () => {
  await saveState(fakeState("alpha", 1, 2));
  const all = await listStates();
  assert.equal(all.length, 1);
  assert.equal(all[0]!.persona.objectKey, "alpha");
});

await it("loadState round-trips the saved state", async () => {
  const a = await loadState("alpha");
  assert.equal(a?.persona.name, "Name alpha");
  assert.equal(a?.history.length, 2);
});

await it("re-saving the same key does NOT duplicate (index idempotent)", async () => {
  await saveState(fakeState("alpha", 2, 4));
  const all = await listStates();
  assert.equal(all.length, 1);
  assert.equal(all.find((s) => s.persona.objectKey === "alpha")?.encounters, 2);
});

await it("distinct keys accumulate", async () => {
  await saveState(fakeState("beta", 5, 1));
  assert.equal((await listStates()).length, 2);
});

await it("summary sorts by encounters desc, then turnCount", async () => {
  const rows = summarize(await listStates());
  assert.equal(rows[0]!.objectKey, "beta"); // 5 > 2
  assert.equal(rows[1]!.objectKey, "alpha");
});

await it("lastMessage = last assistant turn, falls back to tagline", async () => {
  const rows = summarize(await listStates());
  assert.equal(rows.find((r) => r.objectKey === "alpha")?.lastMessage, "turn 3");
  await saveState(fakeState("gamma", 1, 1)); // only a user turn
  const g = summarize(await listStates()).find((r) => r.objectKey === "gamma");
  assert.equal(g?.lastMessage, "a tagline");
});

console.log(`\nok — ${n} tests passed`);
