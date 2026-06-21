// Mirrored from ../src/types.ts — keep in sync with the backend contract.

export type Archetype =
  | "grumpy_elder"
  | "dramatic_diva"
  | "deadpan_stoic"
  | "anxious_overachiever";

export interface Persona {
  objectRecognized: boolean;
  archetype: Archetype;
  objectKey: string;
  object: string;
  name: string;
  tagline: string;
  openingLine: string;
  backstory: string;
  traits: string[];
  voiceModel: string;
  systemPrompt: string;
  portraitPrompt: string;
}

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export interface SessionState {
  persona: Persona;
  portraitUrl: string;
  history: Turn[];
  encounters: number;
}
