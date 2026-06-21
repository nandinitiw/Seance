// Unit tests for the persona pipeline's pure/mock-mode behavior.
// Run with no ANTHROPIC_API_KEY (see the `test` npm script) so awaken() takes the
// deterministic mock path — no network, no cost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { archetypeCatalog, isArchetype, awaken } from "../src/lib/claude.js";

const IMG = { base64: "AAAA", mediaType: "image/jpeg" } as const;

test("archetypeCatalog returns 30 unique, well-formed entries", () => {
  const cat = archetypeCatalog();
  assert.equal(cat.length, 30, "expected 30 archetypes");
  assert.equal(new Set(cat.map((a) => a.key)).size, 30, "keys are unique");
  for (const a of cat) {
    assert.match(a.key, /^[a-z][a-z_]+$/, `key is a lower_snake slug: ${a.key}`);
    assert.equal(a.label[0], a.label[0].toUpperCase(), `label is title-cased: ${a.label}`);
    assert.ok(a.description.length > 10, `has a real description: ${a.key}`);
    assert.ok(isArchetype(a.key), `catalog key passes isArchetype: ${a.key}`);
  }
});

test("isArchetype accepts known keys and rejects anything else", () => {
  assert.ok(isArchetype("grumpy_elder"));
  assert.ok(isArchetype("pirate_captain"));
  assert.equal(isArchetype("not_a_real_one"), false);
  assert.equal(isArchetype(""), false);
  assert.equal(isArchetype(undefined), false);
  assert.equal(isArchetype(42), false);
});

test("awaken (mock mode) returns a complete, valid persona", async () => {
  const p = await awaken(IMG);
  for (const f of [
    "objectKey", "object", "name", "tagline", "openingLine",
    "backstory", "systemPrompt", "portraitPrompt", "voiceModel",
  ] as const) {
    assert.ok(typeof p[f] === "string" && p[f].length > 0, `${f} is a non-empty string`);
  }
  assert.equal(typeof p.objectRecognized, "boolean");
  assert.ok(isArchetype(p.archetype), "archetype is a valid key");
  assert.ok(Array.isArray(p.traits) && p.traits.length > 0, "has traits");
});

test("awaken emits a voice profile within safe ranges", async () => {
  const p = await awaken(IMG);
  assert.ok(p.voice, "voice profile present");
  assert.equal(p.voice.model, p.voiceModel, "voice.model mirrors voiceModel");
  assert.ok(p.voice.rate >= 0.6 && p.voice.rate <= 1.6, `rate in range: ${p.voice.rate}`);
  assert.ok(p.voice.pitch >= 0.4 && p.voice.pitch <= 1.8, `pitch in range: ${p.voice.pitch}`);
  assert.ok(p.voice.volume >= 0.5 && p.voice.volume <= 1, `volume in range: ${p.voice.volume}`);
  assert.ok(typeof p.voice.style === "string" && p.voice.style.length > 0, "has a style note");
});

test("awaken honors forceArchetype and keys memory per personality", async () => {
  const pirate = await awaken(IMG, { forceArchetype: "pirate_captain" });
  assert.equal(pirate.archetype, "pirate_captain", "chosen archetype wins");
  assert.ok(
    pirate.objectKey.endsWith("--pirate_captain"),
    `objectKey is scoped to the personality: ${pirate.objectKey}`,
  );

  const zen = await awaken(IMG, { forceArchetype: "zen_guru" });
  assert.equal(zen.archetype, "zen_guru");
  assert.notEqual(
    pirate.objectKey,
    zen.objectKey,
    "different chosen personalities get distinct memory keys",
  );
});
