// Shared types for Séance. The Persona is the spine of the whole app:
// Claude invents it from a photo, the image generator paints it, Deepgram voices
// it, and Redis remembers it.

/** The fixed comedic registers Claude slots an object into. Keep in sync with
 *  ARCHETYPES in src/lib/claude.ts. */
export type Archetype =
  | "grumpy_elder"
  | "dramatic_diva"
  | "deadpan_stoic"
  | "anxious_overachiever"
  | "conspiracy_theorist"
  | "washed_up_celebrity"
  | "zen_guru"
  | "motivational_coach"
  | "noir_detective"
  | "posh_aristocrat";

export interface Persona {
  /**
   * Whether Claude confidently identified a real object in the photo. When
   * false (blurry shot, no clear object, a scene rather than a thing) the
   * persona is still a valid generic character, but the image hop should paint
   * a generated fallback portrait instead of using the raw photo.
   */
  objectRecognized: boolean;
  /** The comedic archetype Claude slotted this object into. */
  archetype: Archetype;
  /** Stable id derived from the object Claude sees (e.g. "stapler-red-stout"). */
  objectKey: string;
  /** The object as identified, plain words: "a red stapler". */
  object: string;
  /** Character name, e.g. "Klamp the Stapler". */
  name: string;
  /** One-line hook shown in the UI under the portrait. */
  tagline: string;
  /** The character's first spoken line, in voice, ready to play on awaken. */
  openingLine: string;
  /** 2–3 sentence backstory used to seed the conversation + portrait prompt. */
  backstory: string;
  /** Adjectives that define the voice & attitude, e.g. ["bitter", "regal"]. */
  traits: string[];
  /** A Deepgram TTS voice id that fits the character. */
  voiceModel: string;
  /** The system prompt that makes Claude *stay in character* while chatting. */
  systemPrompt: string;
  /** Prompt handed to the image generator to paint the character portrait. */
  portraitPrompt: string;
}

/** One turn of dialogue, stored in Redis so the object has a memory. */
export interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** One line in an object encounter scene. */
export interface EncounterLine {
  /** Which object speaks this line. */
  speaker: "object1" | "object2";
  text: string;
}

/** The result of a two-object encounter. */
export interface EncounterResult {
  lines: EncounterLine[];
  /** Short punchy verdict on the dynamic, e.g. "Rivals", "Star-crossed", "Complicated". */
  relationship: string;
}

/** Everything we persist per awakened object. */
export interface SessionState {
  persona: Persona;
  portraitUrl: string;
  history: Turn[];
  /** How many separate times a human has talked to this object. */
  encounters: number;
}
