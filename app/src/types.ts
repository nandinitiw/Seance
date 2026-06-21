// Client mirror of the server's domain types (see ../../src/types.ts on the
// server). The Persona is the spine: Claude invents it from the photo, the image
// hop paints it, Deepgram voices it, Redis remembers it.

export interface Persona {
  /** Stable id for the object Claude sees (e.g. "stapler-red-stout"). */
  objectKey: string;
  /** The object as identified, plain words: "a red stapler". */
  object: string;
  /** Whether Claude recognized the object (false → mystery portrait). */
  objectRecognized: boolean;
  /** Comedic archetype: grumpy_elder | dramatic_diva | deadpan_stoic | anxious_overachiever. */
  archetype: string;
  /** Character name, e.g. "Klamp the Stapler". */
  name: string;
  /** One-line hook shown under the portrait. */
  tagline: string;
  /** 2–3 sentence backstory. */
  backstory: string;
  /** The character's first spoken line — played aloud the instant it appears. */
  openingLine: string;
  /** Adjectives that define voice & attitude, e.g. ["bitter", "regal"]. */
  traits: string[];
  /** Deepgram TTS voice id that fits the character. */
  voiceModel: string;
  /** System prompt that keeps Claude in character (server-side only, but echoed). */
  systemPrompt: string;
  /** Prompt used by the image hop to paint the portrait. */
  portraitPrompt: string;
}

/** Response from POST /api/awaken. */
export interface AwakenResponse {
  persona: Persona;
  /** A data: URL (mock) or http(s)/relative URL to the portrait image. */
  portraitUrl: string;
  /** How many separate times this object has been awakened. */
  encounters: number;
  /** True when Redis already knew this object — "it remembers you". */
  returning: boolean;
}

/** One line in a two-object encounter scene. */
export interface EncounterLine {
  speaker: "object1" | "object2";
  text: string;
}

/** Response from POST /api/encounter. */
export interface EncounterResponse {
  lines: EncounterLine[];
  persona1: Persona;
  persona2: Persona;
  portraitUrl1: string;
  portraitUrl2: string;
}

/** Response from POST /api/converse. */
export interface ConverseResponse {
  /** What the human said (typed, or transcribed from audio). */
  userText: string;
  /** The character's in-persona reply. */
  replyText: string;
  /** base64 mp3 of the spoken reply when Deepgram is live, else null. */
  audio: string | null;
  voiceModel: string;
}
