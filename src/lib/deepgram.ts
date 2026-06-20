import { config, caps } from "../config.js";

// Deepgram via plain REST (fetch) — no SDK needed for the prerecorded STT + TTS
// turn loop. This is the simplest reliable shape for a 24h build.
//
// UPGRADE PATH: for true real-time, barge-in conversation, swap this turn-based
// loop for the Deepgram Voice Agent API (a single WebSocket that does STT+LLM+TTS
// with turn-taking). See https://developers.deepgram.com/docs/voice-agent
// The persona.systemPrompt + reply() logic in claude.ts maps directly onto the
// Voice Agent's "think" config.

/** Transcribe recorded audio bytes → text. */
export async function transcribe(audio: Buffer, contentType: string): Promise<string> {
  if (!caps.hasDeepgram) return mockTranscribe();

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", config.deepgramSttModel);
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.deepgramKey}`,
      "Content-Type": contentType || "audio/webm",
    },
    // Buffer → Uint8Array so the DOM fetch types accept it as a body.
    body: new Uint8Array(audio),
  });
  if (!res.ok) throw new Error(`Deepgram STT ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as any;
  return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

/**
 * Speak text in the character's voice → MP3 bytes.
 * @param voiceModel a Deepgram aura voice id chosen by the persona
 * Returns null in mock mode; the app then shows the reply as text (no audio).
 */
export async function speak(text: string, voiceModel: string): Promise<Buffer | null> {
  if (!caps.hasDeepgram) return null;

  const url = new URL("https://api.deepgram.com/v1/speak");
  url.searchParams.set("model", voiceModel || config.deepgramTtsModel);
  url.searchParams.set("encoding", "mp3");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.deepgramKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Deepgram TTS ${res.status}: ${await res.text()}`);

  return Buffer.from(await res.arrayBuffer());
}

function mockTranscribe(): string {
  // Without a Deepgram key we can't hear the user; return a canned line so the
  // conversation loop still completes end-to-end during early development.
  const lines = [
    "Hello there, who are you?",
    "What do you want from me?",
    "Tell me your story.",
  ];
  return lines[Math.floor(Date.now() / 1000) % lines.length]!;
}
