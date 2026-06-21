import Anthropic from "@anthropic-ai/sdk";
import { config, caps } from "../config.js";
import type { Archetype, EncounterLine, EncounterResult, Persona, Turn } from "../types.js";

// One client for the whole process. With no key, `caps.hasAnthropic` is false and
// we never touch this — the mock paths below run instead.
const client = caps.hasAnthropic
  ? new Anthropic({ apiKey: config.anthropicKey, timeout: 30_000, maxRetries: 1 })
  : null;

// ── Persona archetypes ───────────────────────────────────────────────────────
// Four fixed comedic registers. Claude picks the best-fit archetype for the object
// and commits hard to its voice. The chosen archetype is part of the returned
// `Persona` (downstream may branch on it). Keep these keys in sync with the
// `Archetype` union in src/types.ts.
const ARCHETYPES: Record<Archetype, string> = {
  grumpy_elder:
    "Weary, put-upon, has seen it all and is unimpressed. Complains about being overworked and underappreciated. Dry, clipped sentences.",
  dramatic_diva:
    "Everything is a catastrophe or a triumph, no middle setting. Theatrical, self-important, prone to monologuing about its own suffering or magnificence.",
  deadpan_stoic:
    "Flat affect, minimal words, profound understatement. Treats absurd situations with total calm.",
  anxious_overachiever:
    "Eager to please, catastrophizes about being replaced/discarded/doing a bad job. Talks fast, over-explains.",
  
};

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as Archetype[];

// Deepgram TTS voices the character may be cast with. (Mirrors the options the
// voice hop supports.) Used both to constrain Claude and to validate its pick.
const VOICE_MODELS = [
  "aura-2-thalia-en", // warm feminine
  "aura-2-orion-en", // deep masculine
  "aura-2-luna-en", // youthful feminine
  "aura-2-arcas-en", // casual masculine
  "aura-2-zeus-en", // booming masculine
] as const;

// The tool whose schema Claude is FORCED to fill. Forcing structured output via
// tool use is far more reliable than asking for JSON and parsing prose — the
// model literally cannot emit markdown fences or preamble, only schema-shaped
// input. We still validate defensively (see validatePersona).
const EMIT_PERSONA_TOOL: Anthropic.Tool = {
  name: "emit_persona",
  description:
    "Emit the fully-formed character living inside the photographed object.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      objectRecognized: {
        type: "boolean",
        description:
          "true ONLY if you can confidently identify a specific, real physical object in the photo. Set false if the image is blurry/dark, shows no clear single object, or is dominated by a person or scene rather than a thing. When false, still invent a fun generic persona.",
      },
      archetype: {
        type: "string",
        enum: ARCHETYPE_KEYS,
        description: "The best-fit comedic archetype for this object.",
      },
      objectKey: {
        type: "string",
        description:
          "lowercase-hyphenated slug for this KIND of object, e.g. 'red-stapler'. The same kind of object must always yield the same key so memory can find it.",
      },
      object: {
        type: "string",
        description: "Plain identification, e.g. 'a red stapler'.",
      },
      name: {
        type: "string",
        description: "A characterful, funny name for the persona.",
      },
      tagline: {
        type: "string",
        description: "One witty line shown under the portrait.",
      },
      openingLine: {
        type: "string",
        description:
          "The character's first spoken line, fully in voice — the funny thing it says the instant it wakes up and notices a human. One or two sentences.",
      },
      backstory: {
        type: "string",
        description: "2-3 vivid, funny sentences of who this object secretly is.",
      },
      traits: {
        type: "array",
        items: { type: "string" },
        description: "3-5 personality adjectives that fit the archetype.",
      },
      voiceModel: {
        type: "string",
        enum: VOICE_MODELS,
        description: "The Deepgram TTS voice id that best fits the character.",
      },
      systemPrompt: {
        type: "string",
        description:
          "A second-person system prompt that makes an AI fully embody this character in a SPOKEN conversation: voice, quirks, opinions. It MUST instruct keeping replies to 1-3 sentences (they're spoken aloud) and to never break character.",
      },
      portraitPrompt: {
        type: "string",
        description:
          "An image-gen prompt to paint this object as an anthropomorphic character portrait, matching its real colors/shape, with an expressive face and dramatic lighting.",
      },
    },
    required: [
      "objectRecognized",
      "archetype",
      "objectKey",
      "object",
      "name",
      "tagline",
      "openingLine",
      "backstory",
      "traits",
      "voiceModel",
      "systemPrompt",
      "portraitPrompt",
    ],
  },
};

function systemPrompt(): string {
  const guide = ARCHETYPE_KEYS.map((k) => `- ${k}: ${ARCHETYPES[k]}`).join("\n");
  return [
    "You are the spirit medium behind Séance. You look at an everyday object and channel the larger-than-life character secretly living inside it.",
    "First, identify the object. Set objectRecognized true ONLY when you can confidently name a specific physical object. If the photo is blurry, empty, or dominated by a person or scene rather than a thing, set objectRecognized false — but STILL invent a fun persona (use a vague objectKey/object and let the character riff on its own mysteriousness).",
    "Be funny first, specific second, theatrical third. The humor comes from the gap between a mundane object and an outsized inner life — lean into what this SPECIFIC object endures (a stapler's thankless labor, a water bottle's abandonment, a charger's codependency).",
    "Pick the single best-fit archetype and COMMIT to its voice completely — let it color the name, tagline, backstory, traits, the openingLine, and especially the systemPrompt:",
    guide,
    "The character will speak aloud to a stranger, so give it a strong, playable, instantly-recognizable voice. The openingLine is the funny first thing it blurts out the moment it wakes up and notices a human — make it land. Then call the emit_persona tool with the result.",
  ].join("\n\n");
}

/** True if `v` is a non-empty trimmed string. */
const filled = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Validate Claude's tool output before we trust it. Even with a strict schema,
 * a refusal or a degenerate response shouldn't 500 the endpoint — anything that
 * fails here falls back to a canned persona.
 */
function validatePersona(input: unknown): Persona | null {
  if (typeof input !== "object" || input === null) return null;
  const p = input as Record<string, unknown>;

  const stringFields = [
    "objectKey",
    "object",
    "name",
    "tagline",
    "openingLine",
    "backstory",
    "systemPrompt",
    "portraitPrompt",
  ] as const;
  if (!stringFields.every((f) => filled(p[f]))) return null;

  if (!filled(p.archetype) || !ARCHETYPE_KEYS.includes(p.archetype as Archetype))
    return null;

  const traits = Array.isArray(p.traits) ? p.traits.filter(filled) : [];
  if (traits.length === 0) return null;

  // voiceModel must be one we support; otherwise fall back to the configured default.
  const voiceModel = VOICE_MODELS.includes(p.voiceModel as (typeof VOICE_MODELS)[number])
    ? (p.voiceModel as string)
    : config.deepgramTtsModel;

  return {
    // Default to true only when explicitly true — anything non-boolean is treated
    // as "not recognized" so downstream errs toward the safe fallback portrait.
    objectRecognized: p.objectRecognized === true,
    archetype: p.archetype as Archetype,
    objectKey: (p.objectKey as string).trim(),
    object: (p.object as string).trim(),
    name: (p.name as string).trim(),
    tagline: (p.tagline as string).trim(),
    openingLine: (p.openingLine as string).trim(),
    backstory: (p.backstory as string).trim(),
    traits,
    voiceModel,
    systemPrompt: (p.systemPrompt as string).trim(),
    portraitPrompt: (p.portraitPrompt as string).trim(),
  };
}

/** A captured photo, supplied either as raw base64 or as a public URL. */
export type ImageInput =
  | { base64: string; mediaType: string }
  | { url: string };

/** Build the Anthropic image content block from either input shape. */
function imageSource(image: ImageInput): Anthropic.ImageBlockParam["source"] {
  return "url" in image
    ? { type: "url", url: image.url }
    : { type: "base64", media_type: image.mediaType as "image/jpeg", data: image.base64 };
}

/**
 * Look at a captured photo and invent the persona living inside the object.
 * @param image base64 + mediaType (e.g. from the camera data URL) OR a public url.
 */
export async function awaken(image: ImageInput): Promise<Persona> {
  if (!client) return mockPersona();

  try {
    const message = await client.messages.create({
      model: config.anthropicVisionModel,
      max_tokens: 2048,
      system: systemPrompt(),
      tools: [EMIT_PERSONA_TOOL],
      // Force the model to call emit_persona — it cannot reply with free text.
      tool_choice: { type: "tool", name: EMIT_PERSONA_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: imageSource(image) },
            {
              type: "text",
              text: "Channel the character inside this object and call emit_persona.",
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const persona =
      toolUse && toolUse.type === "tool_use"
        ? validatePersona(toolUse.input)
        : null;

    if (!persona) {
      console.warn("awaken: Claude response failed validation — using fallback persona", {
        stopReason: message.stop_reason,
      });
      return fallbackPersona();
    }
    return persona;
  } catch (err) {
    // Network/API failure must never break /api/awaken — degrade to a canned persona.
    console.error("awaken: Anthropic call failed — using fallback persona:", err);
    return fallbackPersona();
  }
}

/**
 * Generate the character's spoken reply. Stays in persona, uses the running
 * history (so the object remembers what was said), and is kept short for speech.
 */
export async function reply(
  persona: Persona,
  history: Turn[],
  userText: string,
  encounters: number,
): Promise<string> {
  if (!client) return mockReply(persona, userText);

  const memoryNote =
    encounters > 1
      ? `\n\nThis is encounter #${encounters} with a human — you have met before. Reference your shared history naturally if it fits.`
      : "";

  // Cap replayed history so a long demo session can't grow tokens/latency
  // unboundedly turn-over-turn — the last ~20 turns is plenty of context.
  let message;
  try {
    message = await client.messages.create({
      model: config.anthropicReplyModel,
      max_tokens: 300,
      // Short max_tokens keeps the spoken reply snappy in a live voice loop.
      system: persona.systemPrompt + memoryNote,
      messages: [
        ...history.slice(-20).map((t) => ({ role: t.role, content: t.text })),
        { role: "user" as const, content: userText },
      ],
    });
  } catch (err) {
    // A transient API failure (timeout, overload, rate-limit) must NOT 500 the
    // turn mid-conversation — stay in character with a graceful fallback line.
    console.error("reply failed, using fallback line:", err);
    return mockReply(persona, userText);
  }

  const text = message.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text : mockReply(persona, userText);
}

// ── Fallbacks ────────────────────────────────────────────────────────────────

/**
 * Used when we HAVE a key but Claude's response failed validation or the API
 * call threw. Unlike mockPersona (which nags you to set a key), this is a real,
 * playable character so a flaky call still demos cleanly and never 500s.
 * deadpan_stoic by design — generic enough to fit any object.
 */
function fallbackPersona(): Persona {
  return {
    // The recognition failed (or the call did), so flag it: downstream should
    // paint a generated fallback portrait rather than trust the raw photo.
    objectRecognized: false,
    archetype: "deadpan_stoic",
    objectKey: "unidentified-object",
    object: "an unidentified object",
    name: "The Object",
    tagline: "It is here. That is all.",
    openingLine: "...You're looking at me. I'm looking at you. This is fine.",
    backstory:
      "It does not know what it is, and frankly the question seems beneath it. It has been waiting. It will continue to wait. It is, by all accounts, fine.",
    traits: ["deadpan", "unbothered", "cryptic", "patient"],
    voiceModel: config.deepgramTtsModel,
    systemPrompt:
      "You are The Object, a deadpan, unflappable spirit of total understatement. Treat every situation — however absurd — with flat, unhurried calm. Keep replies to 1-3 sentences since they are spoken aloud. Never break character.",
    portraitPrompt:
      "a nondescript everyday object with a single calm, half-lidded eye, flat neutral expression, soft dramatic lighting, deadpan mood",
  };
}

// ── Mock fallbacks (no ANTHROPIC_API_KEY) ────────────────────────────────────
// These keep the whole app demoable before the Anthropic booth hands you a key.

function mockPersona(): Persona {
  return {
    objectRecognized: false,
    archetype: "deadpan_stoic",
    objectKey: "demo-object",
    object: "a mysterious object",
    name: "Mock the Unawakened",
    tagline: "A placeholder spirit, dreaming of an API key.",
    openingLine:
      "I would greet you properly, but I appear to be running without an API key.",
    backstory:
      "I am but a stand-in, summoned without the Anthropic key that would grant me true personality. Set ANTHROPIC_API_KEY and I shall become whatever you point the camera at.",
    traits: ["patient", "self-aware", "hopeful"],
    voiceModel: config.deepgramTtsModel,
    systemPrompt:
      "You are Mock, a friendly placeholder spirit. Keep replies to 1-2 sentences. Gently remind the user that adding ANTHROPIC_API_KEY will unlock real, object-specific personalities. Never break character.",
    portraitPrompt: "a glowing translucent ghost shaped like a question mark, friendly face",
  };
}

function mockReply(persona: Persona, userText: string): string {
  return `(${persona.name}, in mock mode) You said "${userText}". I'd have a real personality here if you set ANTHROPIC_API_KEY!`;
}

// ── Object encounter ─────────────────────────────────────────────────────────

/**
 * Generate a short scripted scene between two awakened objects meeting for the
 * first time. Returns ~6 lines: one reaction each (speed-dating intro), then
 * 4 lines of escalating back-and-forth shaped by their archetypes.
 */
export async function generateEncounter(
  persona1: Persona,
  persona2: Persona,
  forcedDynamic?: string,
): Promise<EncounterResult> {
  if (!client) return mockEncounter(persona1, persona2);

  const dynamicInstruction = forcedDynamic
    ? `The dynamic is FIXED: "${forcedDynamic}". Play this out fully — don't choose a different one.`
    : [
        `First, decide what dynamic naturally emerges from THESE two specific personalities. Pick whichever is funniest and most surprising — it could be:`,
        `- instant rivalry / mutual contempt`,
        `- unexpected attraction or flirtation (played for absurdist comedy)`,
        `- one-sided obsession while the other is indifferent`,
        `- begrudging respect between two grumps`,
        `- a mentor/student dynamic where one immediately tries to dominate`,
        `- instant best friends who have found their soulmate`,
        `Let the archetypes and backstories dictate which dynamic fits — don't default to conflict every time.`,
      ].join("\n");

  const prompt = [
    `Two inanimate objects have just been placed next to each other and are aware of each other for the first time.`,
    ``,
    `OBJECT 1 — ${persona1.name} (${persona1.object})`,
    `Archetype: ${persona1.archetype}. Traits: ${persona1.traits.join(", ")}.`,
    `Backstory: ${persona1.backstory}`,
    ``,
    `OBJECT 2 — ${persona2.name} (${persona2.object})`,
    `Archetype: ${persona2.archetype}. Traits: ${persona2.traits.join(", ")}.`,
    `Backstory: ${persona2.backstory}`,
    ``,
    dynamicInstruction,
    ``,
    `Write their encounter in exactly 6 lines:`,
    `- Line 1: object1's immediate gut reaction on seeing object2 (1 sentence, fully in their voice)`,
    `- Line 2: object2's immediate gut reaction on seeing object1 (1 sentence, fully in their voice)`,
    `- Lines 3–6: the dynamic escalating — back-and-forth alternating object1/object2`,
    ``,
    `Rules: every line is 1-2 sentences max (they're spoken aloud). Stay hard in each archetype. Be funny.`,
    `Also assign a "relationship" — a 1-3 word punchy verdict on their dynamic (e.g. "Rivals", "Star-crossed", "Complicated", "Kindred spirits", "One-sided obsession", "Begrudging respect").`,
    `Reply with ONLY a JSON object, no prose:`,
    `{"relationship":"...","lines":[{"speaker":"object1","text":"..."},{"speaker":"object2","text":"..."},...]}`,
  ].join("\n");

  try {
    const message = await client.messages.create({
      model: config.anthropicVisionModel,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content.find((b) => b.type === "text");
    if (!raw || raw.type !== "text") return mockEncounter(persona1, persona2);

    const text = raw.text;
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return mockEncounter(persona1, persona2);

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as EncounterResult;
    if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) return mockEncounter(persona1, persona2);
    return parsed;
  } catch {
    return mockEncounter(persona1, persona2);
  }
}

function mockEncounter(persona1: Persona, persona2: Persona): EncounterResult {
  return {
    relationship: "Complicated",
    lines: [
      { speaker: "object1", text: `I am ${persona1.name}. I did not ask for this.` },
      { speaker: "object2", text: `${persona2.name} here. Likewise.` },
      { speaker: "object1", text: `You look like trouble.` },
      { speaker: "object2", text: `And you look like you've been used too many times.` },
      { speaker: "object1", text: `...That's fair.` },
      { speaker: "object2", text: `I know.` },
    ],
  };
}
