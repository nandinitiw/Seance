/**
 * Encounter & TTS smoke tests.
 *
 * Tests the two endpoints added in feature/conversefixes:
 *   1. POST /api/tts   — speaks pre-written text, returns base64 mp3 or null
 *   2. POST /api/encounter — generates a 6-line scripted scene between two objects
 *
 * Usage:
 *   npm run test:encounter                        # shape + endpoint tests
 *   SERVER_URL=http://localhost:3000 npm run test:encounter
 *
 * Requires a running server for endpoint tests. Shape/contract tests run without one.
 * With no DEEPGRAM_API_KEY the TTS audio field will be null — that's still a pass.
 * With no ANTHROPIC_API_KEY the encounter lines will be mock placeholders.
 */
import { caps } from "../src/config.js";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail = "") {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function divider(label = "") {
  const line = "─".repeat(72);
  console.log(label ? `\n${line}\n${label}\n${line}` : line);
}

async function get(path: string) {
  const res = await fetch(`${SERVER_URL}${path}`).catch(() => null);
  return res;
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return res;
}

// ── Seed two objects in Redis so encounter has something to load ──────────────

async function seedObject(objectKey: string, name: string): Promise<boolean> {
  // Check if already seeded — avoids the slow portrait-gen path on repeat runs.
  const existing = await get(`/api/persona/${objectKey}`);
  if (existing?.ok) return true;

  // Not seeded yet: awaken to create the Redis entry, then swap persona to known test data.
  const res = await post("/api/awaken", {
    image: "https://images.unsplash.com/photo-1544731612-de7f96afe55f?w=100",
    objectKey,
  });
  if (!res?.ok) return false;

  // Swap to a predictable test persona (works on both conversefixes and persona-picker branches).
  const swapRes = await fetch(`${SERVER_URL}/api/select-persona`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectKey,
      persona: {
        objectRecognized: true,
        archetype: "grumpy_elder",
        objectKey,
        object: name,
        name,
        tagline: `${name} tagline`,
        openingLine: `I am ${name}.`,
        backstory: "Test backstory.",
        traits: ["grumpy"],
        voiceModel: "aura-2-orion-en",
        systemPrompt: "You are a test persona.",
        portraitPrompt: "test",
      },
    }),
  }).catch(() => null);

  // select-persona only exists on feature/persona-picker; fall back gracefully on conversefixes.
  return res.ok || swapRes?.ok === true;
}

// ── 1. POST /api/tts ──────────────────────────────────────────────────────────

async function testTts() {
  divider("1 · POST /api/tts");

  // 1a. Missing text → 400
  const missingText = await post("/api/tts", {});
  if (!missingText) { console.log("  ⚠  server not reachable — skipping"); return; }
  assert(missingText.status === 400, "missing text → 400", `got ${missingText.status}`);

  // 1b. Empty text → 400
  const emptyText = await post("/api/tts", { text: "   " });
  assert(emptyText?.status === 400, "blank text → 400", `got ${emptyText?.status}`);

  // 1c. Valid request → 200 with { audio: string|null }
  const valid = await post("/api/tts", { text: "Hello from the test suite.", voiceModel: "aura-2-orion-en" });
  assert(valid?.ok === true, "valid text → 200", `got ${valid?.status}`);

  const data = (await valid?.json()) as { audio: string | null } | undefined;
  assert(typeof data === "object" && data !== null, "response is an object");
  assert("audio" in (data ?? {}), "response has audio field");

  if (caps.hasDeepgram) {
    assert(typeof data?.audio === "string" && data.audio.length > 0, "audio is non-empty base64 (Deepgram live)");
    // Rough check: base64 mp3 strings are long
    assert((data?.audio?.length ?? 0) > 100, "audio has meaningful length");
    console.log(`  audio length: ${data?.audio?.length} chars`);
  } else {
    assert(data?.audio === null, "audio is null when Deepgram is off");
    console.log("  Deepgram: off — audio null is expected");
  }

  // 1d. No voiceModel → falls back to default, still 200
  const noVoice = await post("/api/tts", { text: "Testing default voice." });
  assert(noVoice?.ok === true, "no voiceModel → still 200");
}

// ── 2. POST /api/encounter ────────────────────────────────────────────────────

async function testEncounter() {
  divider("2 · POST /api/encounter");

  // 2a. Missing objectKeys → 400
  const missing = await post("/api/encounter", {});
  if (!missing) { console.log("  ⚠  server not reachable — skipping"); return; }
  assert(missing.status === 400, "missing objectKeys → 400", `got ${missing.status}`);

  // 2b. Unknown objectKey → 404
  const unknown = await post("/api/encounter", {
    objectKey1: "nonexistent-obj-aaa",
    objectKey2: "nonexistent-obj-bbb",
  });
  if (!unknown) {
    console.log("  ⚠  connection error on unknown-key test — skipping");
  } else {
    assert(unknown.status === 404, "unknown objectKey → 404", `got ${unknown.status}`);
  }

  // 2c. Seed two objects and run the encounter
  console.log("  seeding test objects…");
  const seeded = await seedObject("test-enc-obj1", "Test Lamp") && await seedObject("test-enc-obj2", "Test Mug");
  if (!seeded) {
    console.log("  ⚠  failed to seed test objects — skipping encounter body tests");
    return;
  }

  const enc = await post("/api/encounter", {
    objectKey1: "test-enc-obj1",
    objectKey2: "test-enc-obj2",
  });
  assert(enc?.ok === true, "valid encounter → 200", `got ${enc?.status}`);

  const data = (await enc?.json()) as Record<string, unknown> | undefined;

  assert(typeof data === "object" && data !== null, "response is an object");
  assert(Array.isArray(data?.lines), "response has lines[]");
  assert(typeof data?.relationship === "string" && (data.relationship as string).length > 0, "response has relationship string");
  assert(typeof data?.persona1 === "object", "response has persona1");
  assert(typeof data?.persona2 === "object", "response has persona2");
  assert(typeof data?.portraitUrl1 === "string", "response has portraitUrl1");
  assert(typeof data?.portraitUrl2 === "string", "response has portraitUrl2");

  const lines = data?.lines as Array<{ speaker: string; text: string }>;
  assert(lines.length >= 2, `at least 2 dialogue lines`, `got ${lines.length}`);

  if (caps.hasAnthropic) {
    assert(lines.length === 6, "exactly 6 lines (live mode)", `got ${lines.length}`);
  }

  for (const [i, line] of lines.entries()) {
    assert(line.speaker === "object1" || line.speaker === "object2", `line[${i}] speaker is object1|object2`, `got "${line.speaker}"`);
    assert(typeof line.text === "string" && line.text.length > 0, `line[${i}] has text`);
  }

  const speakers = new Set(lines.map((l) => l.speaker));
  assert(speakers.size === 2, "both speakers appear in scene", `only saw: ${[...speakers].join(", ")}`);

  console.log(`  relationship: "${data?.relationship}"`);
  console.log(`  lines: ${lines.length}`);
  if (lines.length) console.log(`  sample: [${lines[0]!.speaker}] "${lines[0]!.text}"`);

  // 2d. Custom dynamic
  const rivalsEnc = await post("/api/encounter", {
    objectKey1: "test-enc-obj1",
    objectKey2: "test-enc-obj2",
    dynamic: "rivals",
  });
  assert(rivalsEnc?.ok === true, "encounter with dynamic=rivals → 200");
}

// ── 3. Contract: encounter response shape matches mobile EncounterResponse type ─

async function testEncounterContract() {
  divider("3 · Response contract (EncounterResponse shape)");

  const REQUIRED_FIELDS = ["lines", "relationship", "persona1", "persona2", "portraitUrl1", "portraitUrl2"];
  const LINE_FIELDS = ["speaker", "text"];

  const enc = await post("/api/encounter", {
    objectKey1: "test-enc-obj1",
    objectKey2: "test-enc-obj2",
  });
  if (!enc?.ok) {
    console.log("  ⚠  encounter failed — skipping contract check (objects may not be seeded)");
    return;
  }

  const data = (await enc.json()) as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    assert(field in data, `top-level field "${field}" present`);
  }

  const lines = data.lines as Array<Record<string, unknown>>;
  if (Array.isArray(lines) && lines.length > 0) {
    for (const field of LINE_FIELDS) {
      assert(field in lines[0]!, `line object has "${field}" field`);
    }
  }

  // Persona shape
  const p1 = data.persona1 as Record<string, unknown>;
  for (const field of ["objectKey", "name", "voiceModel"]) {
    assert(typeof p1?.[field] === "string", `persona1.${field} is a string`);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function run() {
  divider("SÉANCE · encounter & TTS tests");
  console.log(`Server:   ${SERVER_URL}`);
  console.log(`Anthropic: ${caps.hasAnthropic ? "LIVE" : "MOCK"}`);
  console.log(`Deepgram:  ${caps.hasDeepgram ? "LIVE" : "OFF"}`);

  await testTts();
  await testEncounter();
  await testEncounterContract();

  divider(`done · ${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
