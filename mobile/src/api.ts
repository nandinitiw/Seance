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

/** One row on the history page — mirrors the server's SessionSummary. */
export interface HistoryItem {
  objectKey: string;
  name: string;
  object: string;
  archetype: string;
  tagline: string;
  portraitUrl: string;
  encounters: number;
  /** Total dialogue turns recorded (user + assistant). */
  turns: number;
  lastMessage: string;
  /** Epoch ms of the last awaken/turn — list is newest-first. */
  updatedAt: number;
}

/** Every object ever awakened (most recent first), for the history page. */
export async function fetchHistory(): Promise<HistoryItem[]> {
  const res = await fetch(`${API_BASE}/api/history`);
  if (!res.ok) throw new Error(`fetchHistory ${res.status}`);
  const data = await res.json();
  return (data.sessions ?? []) as HistoryItem[];
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
export interface EncounterLine {
  speaker: "object1" | "object2";
  text: string;
}

export interface EncounterResponse {
  lines: EncounterLine[];
  relationship: string;
  persona1: Persona;
  persona2: Persona;
  portraitUrl1: string;
  portraitUrl2: string;
}

export async function tts(text: string, voiceModel: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceModel }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as { audio: string | null }).audio;
  } catch {
    return null;
  }
}

export async function encounter(
  objectKey1: string,
  objectKey2: string,
  dynamic?: string,
): Promise<EncounterResponse> {
  const res = await fetch(`${API_BASE}/api/encounter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey1, objectKey2, ...(dynamic ? { dynamic } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `encounter ${res.status}`);
  return data as EncounterResponse;
}

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
