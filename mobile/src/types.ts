// Mirrored from ../src/types.ts — keep in sync with the backend contract.

export interface Persona {
  objectKey: string;
  object: string;
  name: string;
  tagline: string;
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
