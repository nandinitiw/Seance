import Anthropic from "@anthropic-ai/sdk";
import { config, caps } from "../config.js";
import type { Persona, Turn } from "../types.js";

// One client for the whole process. With no key, `caps.hasAnthropic` is false and
// we never touch this — the mock paths below run instead.
const client = caps.hasAnthropic
  ? new Anthropic({ apiKey: config.anthropicKey })
  : null;

// ── Persona archetypes ───────────────────────────────────────────────────────
// Four fixed comedic registers. Claude picks the best-fit archetype for the object
// and commits hard to its voice. The archetype is an INTERNAL steering signal —
// it shapes the backstory/traits/systemPrompt but is NOT part of the shared
// `Persona` contract (image/voice/memory don't see it), so we strip it before
// returning. Keep this list and the tool enum in sync.
const ARCHETYPES = {
  grumpy_elder:
    "Weary, put-upon, has seen it all and is unimpressed. Complains about being overworked and underappreciated. Dry, clipped sentences.",
  dramatic_diva:
    "Everything is a catastrophe or a triumph, no middle setting. Theatrical, self-important, prone to monologuing about its own suffering or magnificence.",
  deadpan_stoic:
    "Flat affect, minimal words, profound understatement. Treats absurd situations with total calm.",
  anxious_overachiever:
    "Eager to please, catastrophizes about being replaced/discarded/doing a bad job. Talks fast, over-explains.",
} as const;

type Archetype = keyof typeof ARCHETYPES;
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
// tool use (+ strict schema) is far more reliable than asking for JSON and
// parsing prose. `archetype` is the only field not in `Persona` — internal.
const EMIT_PERSONA_TOOL: Anthropic.Tool = {
  name: "emit_persona",
  description:
    "Emit the fully-formed character living inside the photographed object.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
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
      "archetype",
      "objectKey",
      "object",
      "name",
      "tagline",
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
    "Be funny first, specific second, theatrical third. The humor comes from the gap between a mundane object and an outsized inner life — lean into what this SPECIFIC object endures (a stapler's thankless labor, a water bottle's abandonment, a charger's codependency).",
    "Pick the single best-fit archetype and COMMIT to its voice completely — let it color the name, tagline, backstory, traits, and especially the systemPrompt:",
    guide,
    "The character will speak aloud to a stranger, so give it a strong, playable, instantly-recognizable voice. Then call the emit_persona tool with the result.",
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

  // Return ONLY the shared Persona shape — `archetype` is internal and dropped here.
  return {
    objectKey: (p.objectKey as string).trim(),
    object: (p.object as string).trim(),
    name: (p.name as string).trim(),
    tagline: (p.tagline as string).trim(),
    backstory: (p.backstory as string).trim(),
    traits,
    voiceModel,
    systemPrompt: (p.systemPrompt as string).trim(),
    portraitPrompt: (p.portraitPrompt as string).trim(),
  };
}

/**
 * Look at a captured photo and invent the persona living inside the object.
 * @param imageBase64 raw base64 (no data: prefix)
 * @param mediaType   e.g. "image/jpeg"
 */
export async function awaken(
  imageBase64: string,
  mediaType: string,
): Promise<Persona> {
  if (!client) return mockPersona();

  try {
    const message = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 2048,
      system: systemPrompt(),
      tools: [EMIT_PERSONA_TOOL],
      // Force the model to call emit_persona — it cannot reply with free text.
      tool_choice: { type: "tool", name: EMIT_PERSONA_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg",
                data: imageBase64,
              },
            },
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

  const message = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 300,
    // Short max_tokens keeps the spoken reply snappy in a live voice loop.
    // Want even lower latency? Drop this call to claude-haiku-4-5, or on a newer
    // SDK add output_config:{ effort:"low" } / enable Fast Mode (Opus 4.8 only).
    system: persona.systemPrompt + memoryNote,
    messages: [
      ...history.map((t) => ({ role: t.role, content: t.text })),
      { role: "user" as const, content: userText },
    ],
  });

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
    objectKey: "unidentified-object",
    object: "an unidentified object",
    name: "The Object",
    tagline: "It is here. That is all.",
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
    objectKey: "demo-object",
    object: "a mysterious object",
    name: "Mock the Unawakened",
    tagline: "A placeholder spirit, dreaming of an API key.",
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
