import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, logCapabilities } from "./config.js";
import { awaken, reply } from "./lib/claude.js";
import { paintPortrait } from "./lib/imagegen.js";
import { transcribe, speak } from "./lib/deepgram.js";
import { loadState, saveState } from "./lib/memory.js";
import type { SessionState } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: "15mb" }));
app.use(express.static(join(__dirname, "..", "public")));

/**
 * POST /api/awaken
 * Body: { image: "data:image/jpeg;base64,..." }
 * Pipeline: photo → Claude invents persona → paint portrait → load/save memory.
 * Returns the persona + portrait + how many times this object has been met.
 */
app.post("/api/awaken", async (req, res) => {
  try {
    const dataUrl: string = req.body.image;
    if (!dataUrl?.startsWith("data:")) {
      return res.status(400).json({ error: "Expected { image: dataURL }" });
    }
    const [, mediaType = "image/jpeg", base64 = ""] =
      dataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];

    // 1. Channel the character from the photo.
    const persona = await awaken(base64, mediaType);

    // 2. Has this object been awakened before? (memory / the "remembers you" beat)
    const prior = await loadState(persona.objectKey);

    // 3. Paint the portrait (skip if we already have one for this object).
    const portraitUrl = prior?.portraitUrl ?? (await paintPortrait(persona, dataUrl));

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
 * POST /api/turn
 * Body: { objectKey, role: "user" | "assistant", text }
 * Appends one conversation turn to the object's Redis history.
 * Called by the Expo app after each ConversationText event from the Voice Agent.
 */
app.post("/api/turn", async (req, res) => {
  const { objectKey, role, text } = req.body as {
    objectKey: string;
    role: "user" | "assistant";
    text: string;
  };
  if (!objectKey || !role || !text) {
    return res.status(400).json({ error: "objectKey, role, and text are required." });
  }
  if (role !== "user" && role !== "assistant") {
    return res.status(400).json({ error: `Invalid role "${role}" — must be "user" or "assistant".` });
  }
  const state = await loadState(objectKey);
  if (!state) return res.status(404).json({ error: "Unknown object — awaken it first." });
  state.history.push({ role, text });
  await saveState(state);
  res.json({ ok: true });
});

app.listen(config.port, () => {
  console.log(`\n🔮 Séance running → http://localhost:${config.port}\n`);
  logCapabilities();
});
