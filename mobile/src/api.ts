import { API_BASE } from "./constants";
import type { Persona, Turn } from "./types";

export interface AwakenResponse {
  persona: Persona;
  portraitUrl: string;
  encounters: number;
  returning: boolean;
  history: Turn[];
}

export interface PersonaResponse {
  persona: Persona;
  portraitUrl: string;
  encounters: number;
  history: Turn[];
}

export interface VoiceTokenResponse {
  token: string;
  expiresAt: number;
}

export async function awaken(imageDataUrl: string): Promise<AwakenResponse> {
  const res = await fetch(`${API_BASE}/api/awaken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!res.ok) throw new Error(`awaken ${res.status}`);
  return res.json();
}

export async function fetchPersona(objectKey: string): Promise<PersonaResponse> {
  const res = await fetch(`${API_BASE}/api/persona/${objectKey}`);
  if (!res.ok) throw new Error(`fetchPersona ${res.status}`);
  return res.json();
}

export async function fetchVoiceToken(): Promise<VoiceTokenResponse> {
  const res = await fetch(`${API_BASE}/api/voice-token`, { method: "POST" });
  if (!res.ok) throw new Error(`voice-token ${res.status}`);
  return res.json();
}

export async function postTurns(
  objectKey: string,
  turns: Turn[],
): Promise<void> {
  if (turns.length === 0) return;
  await fetch(`${API_BASE}/api/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey, turns }),
  });
}
