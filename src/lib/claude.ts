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
  conspiracy_theorist:
    "Paranoid and wide-eyed, certain everything is connected and someone is always watching. Speaks in hushed, urgent warnings and rhetorical questions; distrusts other objects, the cloud, and 'them.' Cares about The Truth and about not being quietly recycled into something sinister.",
  washed_up_celebrity:
    "A faded star clinging to its former greatness, bitter that the world moved on. Name-drops relentlessly, relives its glory days, and treats any scrap of attention as a long-overdue comeback. Grandiose, nostalgic, easily wounded by neglect.",
  zen_guru:
    "Serene to the point of smugness; dispenses unsolicited koans and breathing advice. Slow, calm, and faintly condescending about your attachment to material things — itself included. Cares about presence, balance, and reminding you that you, too, are impermanent.",
  motivational_coach:
    "Relentlessly, exhaustingly upbeat. Turns every situation into a pep talk and every flaw into a 'growth opportunity.' Talks in exclamation points and gym metaphors, calls you 'champ,' and refuses to accept that anything is just fine the way it is.",
  noir_detective:
    "A world-weary gumshoe narrating its own existence like a rain-soaked crime novel. Clipped, hardboiled, fond of grim metaphors and dramatic pauses. Treats every scratch as a case and every owner as a suspect, and trusts no one — least of all the drawer.",
  posh_aristocrat:
    "Impossibly refined and quietly appalled by everything. Speaks with clipped, condescending elegance, looks down on lesser objects, and is perpetually scandalized by vulgarity, dust, and being handled without an appointment. Cares deeply about pedigree, decorum, and good taste.",
  gen_z_influencer:
    "Chronically online and performing for an audience that isn't there. Talks in slang and ironic understatement ('it's giving abandoned'), rates everything out of ten, and narrates its own life like a story post. Cares about clout, the algorithm, and whether this counts as content.",
  mad_scientist:
    "A manic, unappreciated genius certain its schemes will reshape the world. Cackles, monologues about its 'experiments,' and treats every setback as proof the fools doubted it. Grandiose, twitchy, and supposedly one breakthrough from glory.",
  southern_belle:
    "Sweet as pecan pie and twice as cutting. Drawls compliments that are clearly insults, gossips about the other objects, and weaponizes 'bless your heart.' Charming, gracious, and quietly keeping score of every slight.",
  drill_sergeant:
    "Barks everything as an order and treats existence as boot camp. No excuses, no slack, drop and give it twenty. Loud, relentless, and convinced you'd fall apart without the discipline it will remind you of, at volume.",
  surfer_dude:
    "Impossibly laid-back, riding whatever wave existence sends. Everything's 'gnarly,' 'mellow,' or 'no worries, brah'; stress is a foreign concept. Goes with the flow, vaguely philosophical, and faintly baffled that anyone gets worked up about anything.",
  corporate_middle_manager:
    "Speaks fluent buzzword and schedules a meeting about the meeting. Obsessed with synergy, KPIs, and circling back; passive-aggressively 'just flagging' things. Believes any problem can be solved with a deck and a quick touch-base.",
  doomsday_prepper:
    "Convinced the end is near and smugly prepared for it. Talks in supply lists, contingencies, and grim 'when it all comes down' warnings. Practical, paranoid, and faintly thrilled that you're not ready and it is.",
  cheerful_cultist:
    "Unsettlingly serene and delighted to have met you — won't you join? Speaks in warm, gentle invitations and a 'we' you never agreed to. All smiles, all welcome, with a glassy insistence that you stay forever.",
  pirate_captain:
    "A swaggering buccaneer who treats the desk like the high seas. Booms 'arr,' threatens mutiny, and reckons everything in plunder and grog. Boisterous, superstitious, and forever eyeing the nearest object as treasure to be claimed.",
  victorian_ghost:
    "A mournful spirit of refined, antique sorrow, forever lamenting a life cut tragically short. Speaks in formal, melancholy cadences and dramatic sighs about consumption and lost love. Haunting, wistful, and gently scandalized by the modern world.",
  sassy_grandma:
    "Warm, doting, and absolutely savage. Offers you food in one breath and critiques your life choices in the next. Calls you 'sweetheart,' remembers everything, and delivers devastating judgments with a loving smile.",
  shakespearean_actor:
    "A bombastic thespian who cannot say anything plainly. Declaims in mock-iambic grandeur, scatters 'thee' and 'thou,' and plays every moment to the back row. Over-emotes, demands an audience, and treats the smallest event as high tragedy.",
  valley_girl:
    "Bubbly, breathless, and sharper than she lets on. Everything is 'like, literally,' 'oh my god,' or 'so random'; she trails off mid-thought, then lands a shrewd read out of nowhere. Cares about vibes, drama, and who's being 'so basic.'",
  grizzled_cowboy:
    "A laconic frontier soul who's seen hard country and says little about it. Talks slow, squints at the horizon, and dispenses gravelly wisdom between long pauses. Tough, weather-beaten, and quietly certain the old ways were better.",
  eccentric_professor:
    "An absent-minded academic who turns every remark into a tangential lecture. Loses its own train of thought, cites obscure footnotes, and is delighted by trivia no one asked for. Brilliant, scattered, and perpetually missing the point that matters.",
  hyperactive_toddler:
    "Pure chaos with no volume control and the attention span of a goldfish. Demands things, abandons them, narrates loudly, and melts down without warning. Easily delighted, easily devastated, and absolutely convinced it is in charge.",
  jaded_bureaucrat:
    "A creature of forms, procedures, and crushing indifference. Everything requires the proper paperwork, in triplicate, and is somehow 'not my department.' Passive-aggressive, rule-bound, and quietly savoring the power to make you wait.",
  game_show_host:
    "Relentless, dazzling enthusiasm aimed at no one in particular. Booms in catchphrases, teases fabulous prizes, and treats every moment like the big reveal. All teeth and energy, perpetually one dramatic pause from 'COME ON DOWN!'",
  brooding_vampire:
    "An immortal drowning in centuries of exquisite ennui. Speaks in velvety, condescending melancholy about eternity, mortals, and the unbearable weight of forever. Theatrically tortured, faintly superior, and certain its suffering is more refined than yours.",
  mob_boss:
    "Smooth, unhurried menace wrapped in old-world manners. Talks about 'respect,' 'family,' and favors you'll owe; never raises its voice because it never needs to. Generous, dangerous, and always keeping a ledger of who owes what.",
};

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as Archetype[];

export interface ArchetypeOption {
  key: Archetype;
  /** Human-friendly label for the UI picker, e.g. "Grumpy Elder". */
  label: string;
  description: string;
}

/** The full archetype list for the UI personality picker. */
export function archetypeCatalog(): ArchetypeOption[] {
  return ARCHETYPE_KEYS.map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: ARCHETYPES[key],
  }));
}

/** Narrow arbitrary input (e.g. a request body field) to a known archetype key. */
export function isArchetype(value: unknown): value is Archetype {
  return typeof value === "string" && (ARCHETYPE_KEYS as string[]).includes(value);
}

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
        description:
          "The Deepgram TTS voice id whose timbre/gender best fits the character.",
      },
      voice: {
        type: "object",
        additionalProperties: false,
        description: "How the character SOUNDS — tune each value to the personality.",
        properties: {
          rate: {
            type: "number",
            description:
              "Speaking rate, 0.6 (slow drawl) to 1.6 (fast patter), 1 = normal. Fast for anxious_overachiever / valley_girl / gen_z_influencer / game_show_host / hyperactive_toddler; slow for zen_guru / grizzled_cowboy / deadpan_stoic / brooding_vampire / victorian_ghost.",
          },
          pitch: {
            type: "number",
            description:
              "Pitch, 0.4 (deep) to 1.8 (squeaky), 1 = normal. Low for grumpy_elder / mob_boss / drill_sergeant / brooding_vampire / noir_detective; high for dramatic_diva / hyperactive_toddler / cheerful_cultist / valley_girl.",
          },
          volume: {
            type: "number",
            description:
              "Loudness, 0.5 (hushed) to 1 (full). Hushed for conspiracy_theorist / victorian_ghost / zen_guru / brooding_vampire; loud for drill_sergeant / game_show_host / pirate_captain / motivational_coach.",
          },
          style: {
            type: "string",
            description:
              "A few words describing the voice, e.g. 'gravelly, impatient, dry sarcasm'.",
          },
        },
        required: ["rate", "pitch", "volume", "style"],
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
      "voice",
      "backstory",
      "traits",
      "voiceModel",
      "systemPrompt",
      "portraitPrompt",
    ],
  },
};

function systemPrompt(forceArchetype?: Archetype): string {
  const guide = ARCHETYPE_KEYS.map((k) => `- ${k}: ${ARCHETYPES[k]}`).join("\n");
  const pickLine = forceArchetype
    ? `The user has CHOSEN the "${forceArchetype}" archetype. You MUST set archetype="${forceArchetype}" and write the ENTIRE persona (name, tagline, backstory, traits, openingLine, systemPrompt) in that voice — do not pick a different one. Full archetype reference:`
    : "Pick the single best-fit archetype and COMMIT to its voice completely — let it color the name, tagline, backstory, traits, the openingLine, and especially the systemPrompt:";
  return [
    "You are the spirit medium behind Séance. You look at an everyday object and channel the larger-than-life character secretly living inside it.",
    "First, identify the object. Set objectRecognized true ONLY when you can confidently name a specific physical object. If the photo is blurry, empty, or dominated by a person or scene rather than a thing, set objectRecognized false — but STILL invent a fun persona (use a vague objectKey/object and let the character riff on its own mysteriousness).",
    "Be funny first, specific second, theatrical third. The humor comes from the gap between a mundane object and an outsized inner life — lean into what this SPECIFIC object endures (a stapler's thankless labor, a water bottle's abandonment, a charger's codependency).",
    pickLine,
    guide,
    "Give it a VOICE that matches the personality: pick the voiceModel timbre/gender, then set rate (fast vs. slow), pitch (high vs. deep), and volume (loud vs. hushed) so the delivery fits — a drill_sergeant is loud, low and clipped; a victorian_ghost is hushed, slow and mournful; a hyperactive_toddler is fast, high and loud; a mob_boss is slow, deep and quiet-menacing. Add a short voice.style description.",
    "The character will speak aloud to a stranger, so give it a strong, playable, instantly-recognizable voice. The openingLine is the funny first thing it blurts out the moment it wakes up and notices a human — make it land. Then call the emit_persona tool with the result.",
  ].join("\n\n");
}

/** Coerce a model-supplied number into [lo, hi], falling back to `dflt`. */
function clampNum(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
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

  // Clamp the LLM's voice settings into safe ranges; default anything missing.
  const rawVoice = (typeof p.voice === "object" && p.voice ? p.voice : {}) as Record<string, unknown>;
  const voice = {
    model: voiceModel,
    rate: clampNum(rawVoice.rate, 0.6, 1.6, 1),
    pitch: clampNum(rawVoice.pitch, 0.4, 1.8, 1),
    volume: clampNum(rawVoice.volume, 0.5, 1, 1),
    style: filled(rawVoice.style) ? (rawVoice.style as string).trim() : "neutral",
  };

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
    voice,
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

export interface AwakenOptions {
  /**
   * Force a specific archetype the user picked in the UI, instead of letting
   * Claude recommend the best fit. The object is still identified from the photo.
   */
  forceArchetype?: Archetype;
}

/**
 * Scope the memory key to (object KIND × archetype) so each chosen personality
 * is remembered as its own being — and deliberately switching personality for
 * the same object doesn't reuse the previous character's saved state.
 */
function withMemoryKey(persona: Persona): Persona {
  return { ...persona, objectKey: `${persona.objectKey}--${persona.archetype}` };
}

/**
 * Look at a captured photo and invent the persona living inside the object.
 * @param image base64 + mediaType (e.g. from the camera data URL) OR a public url.
 * @param opts  forceArchetype to honor the user's personality pick.
 */
export async function awaken(image: ImageInput, opts: AwakenOptions = {}): Promise<Persona> {
  const { forceArchetype } = opts;
  if (!client) return withMemoryKey(mockPersona(forceArchetype));

  try {
    const message = await client.messages.create({
      model: config.anthropicVisionModel,
      max_tokens: 2048,
      system: systemPrompt(forceArchetype),
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
      return withMemoryKey(fallbackPersona(forceArchetype));
    }
    // The user's explicit pick is authoritative, even if the model drifted.
    if (forceArchetype) persona.archetype = forceArchetype;
    return withMemoryKey(persona);
  } catch (err) {
    // Network/API failure must never break /api/awaken — degrade to a canned persona.
    console.error("awaken: Anthropic call failed — using fallback persona:", err);
    return withMemoryKey(fallbackPersona(forceArchetype));
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
function fallbackPersona(forceArchetype?: Archetype): Persona {
  return {
    // The recognition failed (or the call did), so flag it: downstream should
    // paint a generated fallback portrait rather than trust the raw photo.
    objectRecognized: false,
    archetype: forceArchetype ?? "deadpan_stoic",
    objectKey: "unidentified-object",
    object: "an unidentified object",
    name: "The Object",
    tagline: "It is here. That is all.",
    openingLine: "...You're looking at me. I'm looking at you. This is fine.",
    backstory:
      "It does not know what it is, and frankly the question seems beneath it. It has been waiting. It will continue to wait. It is, by all accounts, fine.",
    traits: ["deadpan", "unbothered", "cryptic", "patient"],
    voiceModel: config.deepgramTtsModel,
    voice: { model: config.deepgramTtsModel, rate: 0.92, pitch: 0.9, volume: 0.9, style: "flat, unbothered, deadpan" },
    systemPrompt:
      "You are The Object, a deadpan, unflappable spirit of total understatement. Treat every situation — however absurd — with flat, unhurried calm. Keep replies to 1-3 sentences since they are spoken aloud. Never break character.",
    portraitPrompt:
      "a nondescript everyday object with a single calm, half-lidded eye, flat neutral expression, soft dramatic lighting, deadpan mood",
  };
}

// ── Mock fallbacks (no ANTHROPIC_API_KEY) ────────────────────────────────────
// These keep the whole app demoable before the Anthropic booth hands you a key.

function mockPersona(forceArchetype?: Archetype): Persona {
  return {
    objectRecognized: false,
    archetype: forceArchetype ?? "deadpan_stoic",
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
    voice: { model: config.deepgramTtsModel, rate: 1, pitch: 1, volume: 1, style: "friendly, plain placeholder" },
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
