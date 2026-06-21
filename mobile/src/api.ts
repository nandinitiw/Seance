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

export interface ConverseResponse {
  /** What the human said (Deepgram STT transcript, or the typed text). */
  userText: string;
  /** The in-character spoken reply (Claude). */
  replyText: string;
  /** base64-encoded mp3 of the reply, or null when TTS is unavailable. */
  audio: string | null;
  voiceModel: string;
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

export interface ConverseInput {
  objectKey: string;
  /** A local file URI from an expo-av Recording (e.g. file:///…/speech.m4a). */
  audioUri?: string;
  /** Typed message — fallback / no-mic. Wins over audio if both are present. */
  text?: string;
}

/**
 * POST /api/converse (multipart) — send recorded audio or typed text, get back
 * what was heard, the in-character reply, and base64 mp3 to play.
 * One round-trip: Deepgram STT → Claude reply → Deepgram TTS. The server also
 * persists the exchange to memory, so the client does not post turns separately.
 */
export async function converse({
  objectKey,
  audioUri,
  text,
}: ConverseInput): Promise<ConverseResponse> {
  const form = new FormData();
  form.append("objectKey", objectKey);
  if (text) form.append("text", text);
  if (audioUri) {
    const name = audioUri.split("/").pop() || "speech.m4a";
    const ext = name.split(".").pop()?.toLowerCase();
    const type =
      ext === "m4a" || ext === "mp4" ? "audio/mp4" : `audio/${ext || "m4a"}`;
    // @ts-expect-error — RN FormData accepts the { uri, name, type } file object.
    form.append("audio", { uri: audioUri, name, type });
  }

  const res = await fetch(`${API_BASE}/api/converse`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `converse ${res.status}`);
  return data as ConverseResponse;
}
