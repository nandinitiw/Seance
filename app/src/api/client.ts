import { API_BASE_URL } from "../config";
import type { AwakenResponse, ConverseResponse, EncounterResponse } from "../types";

// Thin client over the two Séance endpoints. Mirrors public/app.js on the web
// side, adapted for React Native (FormData file = { uri, name, type }).

/**
 * POST /api/awaken — hand the server a captured photo as a data: URL, get back
 * the channeled persona, its portrait, and whether this object is a returning one.
 */
export async function awaken(imageDataUrl: string): Promise<AwakenResponse> {
  const res = await fetch(`${API_BASE_URL}/api/awaken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `awaken failed (${res.status})`);
  return data as AwakenResponse;
}

export interface ConverseInput {
  objectKey: string;
  /** A local file URI from expo-av Recording (e.g. file:///.../speech.m4a). */
  audioUri?: string;
  /** Typed message — used as a fallback / when no mic. Wins over audio if both. */
  text?: string;
}

/**
 * POST /api/converse (multipart) — send either recorded audio or typed text,
 * get back what was heard, the in-character reply, and base64 mp3 to play.
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
    // RN multipart file shape. m4a is what expo-av records by default.
    const name = audioUri.split("/").pop() || "speech.m4a";
    const ext = name.split(".").pop()?.toLowerCase();
    const type = ext === "m4a" || ext === "mp4" ? "audio/mp4" : `audio/${ext || "m4a"}`;
    // @ts-expect-error — RN's FormData accepts the { uri, name, type } file object.
    form.append("audio", { uri: audioUri, name, type });
  }

  const res = await fetch(`${API_BASE_URL}/api/converse`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `converse failed (${res.status})`);
  return data as ConverseResponse;
}

/**
 * POST /api/encounter — generate a scripted 6-line scene between two awakened objects.
 */
export async function encounter(objectKey1: string, objectKey2: string): Promise<EncounterResponse> {
  const res = await fetch(`${API_BASE_URL}/api/encounter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey1, objectKey2 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `encounter failed (${res.status})`);
  return data as EncounterResponse;
}
