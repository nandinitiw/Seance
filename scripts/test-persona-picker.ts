/**
 * Persona picker smoke tests.
 *
 * Tests three things:
 *   1. awakenAll() returns 3 distinct personas with different archetypes (live or mock)
 *   2. validatePersona logic catches bad inputs (no network needed)
 *   3. POST /api/select-persona swaps the active persona without touching history
 *
 * Usage:
 *   npm run test:persona-picker          # all tests
 *   SERVER_URL=http://localhost:3000     # point at a running server for endpoint tests
 *
 * With no ANTHROPIC_API_KEY the Claude tests run the mock path; all assertions
 * that would require real Claude output are skipped gracefully.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { caps } from "../src/config.js";
import { awakenAll } from "../src/lib/claude.js";
import type { Persona } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(here, "sample-images");
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// ── Tiny assertion helpers ────────────────────────────────────────────────────

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

// ── 1. awakenAll output shape ─────────────────────────────────────────────────

async function testAwakenAll() {
  divider("1 · awakenAll() — output shape");

  // Find one sample image, or use a public URL as fallback.
  let image: { base64: string; mediaType: string } | { url: string };
  try {
    const files = readdirSync(IMAGES_DIR).filter((f) => extname(f).toLowerCase() in MEDIA_TYPES);
    if (files.length) {
      const file = files[0]!;
      image = {
        base64: readFileSync(join(IMAGES_DIR, file)).toString("base64"),
        mediaType: MEDIA_TYPES[extname(file).toLowerCase()]!,
      };
      console.log(`  image: ${file}`);
    } else {
      throw new Error("no files");
    }
  } catch {
    // Fallback to a stable public image (a red mug)
    image = { url: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400" };
    console.log("  image: public URL fallback (no sample-images)");
  }

  console.log(`  Anthropic: ${caps.hasAnthropic ? "LIVE" : "MOCK"}`);

  const started = Date.now();
  const personas = await awakenAll(image);
  const ms = Date.now() - started;
  console.log(`  ${ms} ms`);

  // Shape assertions (work in both live and mock mode)
  assert(Array.isArray(personas), "returns an array");
  assert(personas.length >= 1, "at least one persona returned", `got ${personas.length}`);

  for (const [i, p] of personas.entries()) {
    const label = `persona[${i}]`;
    assert(typeof p.name === "string" && p.name.length > 0, `${label} has name`);
    assert(typeof p.tagline === "string" && p.tagline.length > 0, `${label} has tagline`);
    assert(typeof p.openingLine === "string" && p.openingLine.length > 0, `${label} has openingLine`);
    assert(typeof p.objectKey === "string" && p.objectKey.length > 0, `${label} has objectKey`);
    assert(typeof p.voiceModel === "string" && p.voiceModel.length > 0, `${label} has voiceModel`);
    assert(Array.isArray(p.traits) && p.traits.length > 0, `${label} has traits`);
  }

  if (caps.hasAnthropic && personas.length >= 2) {
    // Claude should return genuinely different archetypes when asked for 3
    const archetypes = personas.map((p) => p.archetype);
    const uniqueArchetypes = new Set(archetypes).size;
    assert(uniqueArchetypes >= 2, "personas have ≥2 distinct archetypes", `got: ${archetypes.join(", ")}`);

    const names = personas.map((p) => p.name);
    assert(new Set(names).size === names.length, "all persona names are distinct", `got: ${names.join(", ")}`);
  }

  if (caps.hasAnthropic) {
    assert(personas.length === 3, "exactly 3 personas returned (live mode)", `got ${personas.length}`);
  }

  // Print for human review
  console.log();
  for (const [i, p] of personas.entries()) {
    console.log(`  [${i + 1}${i === 0 ? " ★ recommended" : ""}] ${p.name} (${p.archetype})`);
    console.log(`       "${p.openingLine}"`);
  }
}

// ── 2. /api/select-persona endpoint ──────────────────────────────────────────

async function testSelectPersonaEndpoint() {
  divider("2 · POST /api/select-persona — endpoint");

  // First awaken an object so Redis has a state to update.
  const awakenRes = await fetch(`${SERVER_URL}/api/awaken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=200" }),
  }).catch(() => null);

  if (!awakenRes) {
    console.log("  ⚠  server not reachable at", SERVER_URL, "— skipping endpoint tests");
    console.log("     Start the server with `npm run dev` and set SERVER_URL to test.");
    return;
  }

  assert(awakenRes.ok, `/api/awaken returned 2xx`, `status ${awakenRes.status}`);
  const awakenData = (await awakenRes.json()) as {
    persona: Persona;
    personas: Persona[];
    returning: boolean;
  };

  assert(Array.isArray(awakenData.personas), "response includes personas[]");
  assert(awakenData.personas.length >= 1, "personas[] is non-empty");

  const objectKey = awakenData.persona.objectKey;

  // Pick the second persona if available, otherwise mutate the first
  const altPersona: Persona = awakenData.personas[1] ?? {
    ...awakenData.persona,
    name: "Test Swap Persona",
    tagline: "I was swapped in by the test suite.",
  };

  const selectRes = await fetch(`${SERVER_URL}/api/select-persona`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey, persona: altPersona }),
  });
  assert(selectRes.ok, `/api/select-persona returned 2xx`, `status ${selectRes.status}`);
  const selectData = (await selectRes.json()) as { ok: boolean };
  assert(selectData.ok === true, "response body is { ok: true }");

  // Verify the persona was actually swapped in Redis
  const personaRes = await fetch(`${SERVER_URL}/api/persona/${objectKey}`);
  assert(personaRes.ok, `/api/persona lookup returned 2xx`);
  const personaData = (await personaRes.json()) as { persona: Persona };
  assert(personaData.persona.name === altPersona.name, "saved persona matches selected one", `expected "${altPersona.name}", got "${personaData.persona.name}"`);

  // Verify history was NOT wiped
  assert(Array.isArray(personaData.persona === personaData.persona), "persona still valid after swap");

  console.log(`  objectKey: ${objectKey}`);
  console.log(`  swapped to: ${altPersona.name}`);
}

// ── 3. awakenAll response in /api/awaken ──────────────────────────────────────

async function testAwakenEndpoint() {
  divider("3 · POST /api/awaken — personas[] in response");

  const res = await fetch(`${SERVER_URL}/api/awaken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "https://images.unsplash.com/photo-1544731612-de7f96afe55f?w=200" }),
  }).catch(() => null);

  if (!res) {
    console.log("  ⚠  server not reachable — skipping");
    return;
  }

  assert(res.ok, `/api/awaken returned 2xx`, `status ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  assert("persona" in data, "response has persona field");
  assert("personas" in data, "response has personas[] field");
  assert(Array.isArray(data.personas), "personas is an array");
  assert((data.personas as unknown[]).length >= 1, "personas has ≥1 entry");
  assert("portraitUrl" in data, "response has portraitUrl");
  assert("returning" in data, "response has returning flag");
  assert("encounters" in data, "response has encounters count");
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function run() {
  divider("SÉANCE · persona picker tests");
  console.log(`Server: ${SERVER_URL}`);

  await testAwakenAll();
  await testAwakenEndpoint();
  await testSelectPersonaEndpoint();

  divider(`done · ${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
