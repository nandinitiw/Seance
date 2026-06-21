import express from "express";
import multer from "multer";
import { config, caps, logCapabilities } from "./config.js";
import { awaken, reply, generateEncounter, type ImageInput } from "./lib/claude.js";
import { paintPortrait, generateMysteryPortrait } from "./lib/imagegen.js";
import { transcribe, speak } from "./lib/deepgram.js";
import { loadState, saveState } from "./lib/memory.js";
import type { SessionState } from "./types.js";

// API only — the client is the Expo phone app in app/. No static web frontend.
/** Normalize objectKey so Redis lookups are stable regardless of Claude's exact casing/spacing. */
function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: "15mb" }));

/**
 * POST /api/awaken
 * Body: { image: "data:image/jpeg;base64,..." | "https://..." }
 * Pipeline: photo → Claude invents persona → paint portrait → load/save memory.
 * Returns the persona + portrait + how many times this object has been met.
 */
app.post("/api/awaken", async (req, res) => {
  try {
    const image: string = req.body.image;
    let input: ImageInput;
    if (image?.startsWith("data:")) {
      const [, mediaType = "image/jpeg", base64 = ""] =
        image.match(/^data:([^;]+);base64,(.+)$/) ?? [];
      input = { base64, mediaType };
    } else if (/^https?:\/\//.test(image ?? "")) {
      input = { url: image };
    } else {
      return res.status(400).json({ error: "Expected { image: dataURL | https URL }" });
    }

    // 1. Channel the character from the photo.
    const persona = await awaken(input);
    persona.objectKey = normalizeKey(persona.objectKey);

    // 2. Has this object been awakened before? (memory / the "remembers you" beat)
    const prior = await loadState(persona.objectKey);

    // 3. Paint the portrait (skip if we already have one for this object).
    //    Unrecognized objects get a Pollinations mystery creature instead of
    //    the normal image-gen path.
    const portraitUrl =
      prior?.portraitUrl ??
      (persona.objectRecognized
        ? await paintPortrait(persona, image)
        : await generateMysteryPortrait(image));

    const state: SessionState = {
      persona: prior?.persona ?? persona,
      portraitUrl,
      history: prior?.history ?? [],
      encounters: (prior?.encounters ?? 0) + 1,
    };
    await saveState(state);

    res.json({
      persona: state.persona,
      portraitUrl: state.portraitUrl,
      encounters: state.encounters,
      returning: Boolean(prior),
      history: state.history,
    });
  } catch (err) {
    console.error("awaken failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/converse  (multipart)
 * Fields: objectKey (text), audio (file, optional), text (text, optional)
 * Pipeline: audio → Deepgram STT → Claude in-persona reply → Deepgram TTS.
 * Returns { userText, replyText, audio? } — audio is base64 mp3 when Deepgram is live.
 */
app.post("/api/converse", upload.single("audio"), async (req, res) => {
  try {
    const objectKey: string = req.body.objectKey;
    const state = await loadState(objectKey);
    if (!state) return res.status(404).json({ error: "Unknown object — awaken it first." });

    // 1. What did the human say? (typed text wins; else transcribe the audio)
    const userText: string = req.body.text?.trim()
      ? req.body.text.trim()
      : req.file
        ? await transcribe(req.file.buffer, req.file.mimetype)
        : "";
    if (!userText) return res.status(400).json({ error: "No speech or text received." });

    // 2. The character replies, in persona, remembering the conversation.
    const replyText = await reply(state.persona, state.history, userText, state.encounters);

    // 3. Persist the exchange so the memory grows.
    state.history.push({ role: "user", text: userText });
    state.history.push({ role: "assistant", text: replyText });
    await saveState(state);

    // 4. Voice it.
    const audio = await speak(replyText, state.persona.voiceModel);

    res.json({
      userText,
      replyText,
      audio: audio ? audio.toString("base64") : null,
      voiceModel: state.persona.voiceModel,
    });
  } catch (err) {
    console.error("converse failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

/** GET /api/status — quick capability check for integration debugging. */
app.get("/api/status", (_req, res) => {
  res.json({
    anthropic: caps.hasAnthropic,
    deepgram: caps.hasDeepgram,
    redis: caps.hasRedis,
    imageProvider: config.imageProvider,
  });
});

/**
 * GET /api/persona/:objectKey
 * Returns the saved persona + history for an already-awakened object.
 * Used by the Expo conversation screen to restore state without a new photo.
 */
app.get("/api/persona/:objectKey", async (req, res) => {
  const state = await loadState(req.params.objectKey);
  if (!state) return res.status(404).json({ error: "Unknown object — awaken it first." });
  res.json({
    persona: state.persona,
    portraitUrl: state.portraitUrl,
    encounters: state.encounters,
    history: state.history,
  });
});

/**
 * POST /api/voice-token
 * Mints a short-lived Deepgram token (1 h) so the mobile app never ships the raw key.
 * Falls back to a mock token when Deepgram is not configured (dev mode).
 */
app.post("/api/voice-token", async (req, res) => {
  if (!config.deepgramKey) {
    return res.json({ token: "mock-token", expiresAt: Date.now() + 3_600_000 });
  }
  try {
    const r = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${config.deepgramKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 3600 }),
    });
    if (!r.ok) throw new Error(`Deepgram grant ${r.status}: ${await r.text()}`);
    const { access_token, expires_in } = (await r.json()) as any;
    res.json({ token: access_token, expiresAt: Date.now() + expires_in * 1000 });
  } catch (err) {
    console.error("voice-token failed:", err);
    res.status(502).json({ error: String(err) });
  }
});

/**
 * POST /api/turns
 * Body: { objectKey, turns: Array<{ role: "user" | "assistant", text: string }> }
 * Atomically appends a full exchange (user turn + assistant reply) in one write.
 * Batching prevents the lost-update race where two concurrent single-turn calls
 * both loadState, both push, and the second saveState drops the first turn.
 */
app.post("/api/turns", async (req, res) => {
  const { objectKey, turns } = req.body as {
    objectKey: string;
    turns: Array<{ role: string; text: string }>;
  };
  if (!objectKey || !Array.isArray(turns) || turns.length === 0) {
    return res.status(400).json({ error: "objectKey and a non-empty turns array are required." });
  }
  for (const t of turns) {
    if (t.role !== "user" && t.role !== "assistant") {
      return res.status(400).json({ error: `Invalid role "${t.role}" — must be "user" or "assistant".` });
    }
    if (!t.text) {
      return res.status(400).json({ error: "Each turn must have a non-empty text field." });
    }
  }
  const state = await loadState(objectKey);
  if (!state) return res.status(404).json({ error: "Unknown object — awaken it first." });
  for (const t of turns) {
    state.history.push({ role: t.role as "user" | "assistant", text: t.text });
  }
  await saveState(state);
  res.json({ ok: true });
});

/**
 * POST /api/encounter
 * Body: { objectKey1: string, objectKey2: string }
 * Generates a scripted 6-line scene between two awakened objects.
 * Returns { lines: EncounterLine[], persona1: Persona, persona2: Persona }
 */
app.post("/api/encounter", async (req, res) => {
  const { objectKey1, objectKey2 } = req.body as { objectKey1: string; objectKey2: string };
  if (!objectKey1 || !objectKey2) {
    return res.status(400).json({ error: "objectKey1 and objectKey2 are required." });
  }
  const [state1, state2] = await Promise.all([loadState(objectKey1), loadState(objectKey2)]);
  if (!state1) return res.status(404).json({ error: `Unknown object: ${objectKey1}` });
  if (!state2) return res.status(404).json({ error: `Unknown object: ${objectKey2}` });

  const lines = await generateEncounter(state1.persona, state2.persona);
  res.json({
    lines,
    persona1: state1.persona,
    persona2: state2.persona,
    portraitUrl1: state1.portraitUrl,
    portraitUrl2: state2.portraitUrl,
  });
});

app.listen(config.port, () => {
  console.log(`\n🔮 Séance running → http://localhost:${config.port}\n`);
  logCapabilities();
});
