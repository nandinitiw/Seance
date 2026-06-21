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
  | "posh_aristocrat"
  | "gen_z_influencer"
  | "mad_scientist"
  | "southern_belle"
  | "drill_sergeant"
  | "surfer_dude"
  | "corporate_middle_manager"
  | "doomsday_prepper"
  | "cheerful_cultist"
  | "pirate_captain"
  | "victorian_ghost"
  | "sassy_grandma"
  | "shakespearean_actor"
  | "valley_girl"
  | "grizzled_cowboy"
  | "eccentric_professor"
  | "hyperactive_toddler"
  | "jaded_bureaucrat"
  | "game_show_host"
  | "brooding_vampire"
  | "mob_boss";

/**
 * The voice the LLM picks to match the personality. `model` chooses the Deepgram
 * timbre; rate/pitch/volume shape delivery — applied natively to browser TTS and
 * approximated on the Deepgram audio via playbackRate/volume.
 */
export interface VoiceSettings {
  /** Deepgram Aura-2 voice id (the closest-fitting timbre). Mirrors persona.voiceModel. */
  model: string;
  /** Speaking rate, 0.6 (slow drawl) – 1.6 (fast patter). 1 = normal. */
  rate: number;
  /** Pitch, 0.4 (deep) – 1.8 (squeaky). 1 = normal. (Browser TTS only.) */
  pitch: number;
  /** Loudness, 0.5 (hushed) – 1 (full). */
  volume: number;
  /** Short description of the voice, e.g. "gravelly, impatient, dry sarcasm". */
  style: string;
}

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
  /** A Deepgram TTS voice id that fits the character (also in voice.model). */
  voiceModel: string;
  /** Full voice profile the LLM picked to match the personality. */
  voice: VoiceSettings;
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
