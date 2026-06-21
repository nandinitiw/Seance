import express from "express";
import multer from "multer";
import { config, caps, logCapabilities } from "./config.js";
import { awaken, awakenAll, reply, generateEncounter, archetypeCatalog, type ImageInput } from "./lib/claude.js";
import { paintPortrait, generateMysteryPortrait } from "./lib/imagegen.js";
import { transcribe, speak } from "./lib/deepgram.js";
import { loadState, saveState, loadPairDynamic, savePairDynamic } from "./lib/memory.js";
import { recordSession, listSessions, getSession } from "./lib/history.js";
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
 * GET /api/archetypes
 * The personality catalog (key + label + description) for the UI picker.
 */
app.get("/api/archetypes", (_req, res) => {
  res.json({ archetypes: archetypeCatalog() });
});

/**
 * GET /api/history
 * The "past chats" gallery — every remembered object, most recent first.
 */
app.get("/api/history", async (_req, res) => {
  try {
    res.json({ sessions: await listSessions() });
  } catch (err) {
    console.error("history list failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/history/:objectKey
 * Reopen a past chat: the persona + portrait + full transcript to revisit.
 */
app.get("/api/history/:objectKey", async (req, res) => {
  try {
    const state = await getSession(req.params.objectKey);
    if (!state) return res.status(404).json({ error: "That memory has faded — awaken it again." });
    res.json({
      persona: state.persona,
      portraitUrl: state.portraitUrl,
      encounters: state.encounters,
      history: state.history,
    });
  } catch (err) {
    console.error("history fetch failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/awaken
 * Body: { image: "data:image/jpeg;base64,..." | "https://...", archetype?: string }
 * Pipeline: photo → Claude invents persona → paint portrait → load/save memory.
 * Omit `archetype` to get Claude's recommendation; pass one of /api/archetypes
 * to force the personality the user picked.
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

    // 1. Channel 3 ranked personas from the photo.
    const personas = await awakenAll(input);
    for (const p of personas) {
      p.objectKey = normalizeKey(p.objectKey);
    }
    // Optional override: pin a stable objectKey so the same rehearsed object
    // reliably "remembers you" across scans.
    if (typeof req.body.objectKey === "string" && req.body.objectKey.trim()) {
      const key = normalizeKey(req.body.objectKey);
      for (const p of personas) p.objectKey = key;
    }

    // 2. Has this object been awakened before?
    // awakenAll always returns ≥1 persona (falls back to fallbackPersona on error).
    const primaryPersona = personas[0]!;
    const prior = await loadState(primaryPersona.objectKey);

    // 3. Paint the portrait once (skip if returning; use first persona's prompts).
    const portraitUrl =
      prior?.portraitUrl ??
      (primaryPersona.objectRecognized
        ? await paintPortrait(primaryPersona, image)
        : await generateMysteryPortrait(image));

    // Save the top-ranked persona as the active one.
    const state: SessionState = {
      persona: prior?.persona ?? primaryPersona,
      portraitUrl,
      history: prior?.history ?? [],
      encounters: (prior?.encounters ?? 0) + 1,
    };
    await saveState(state);
    await recordSession(state); // index it for the "past chats" gallery

    res.json({
      persona: state.persona,
      // All 3 ranked personas so the client can offer a picker.
      // Returning objects get only their saved persona (they already have history).
      personas: prior ? [state.persona] : personas,
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
 * POST /api/select-persona
 * Body: { objectKey, persona: Persona }
 * Swaps the active persona for an awakened object without resetting history.
 * Called when the user picks one of the alt personas from the reveal screen picker.
 */
app.post("/api/select-persona", async (req, res) => {
  try {
    const { objectKey, persona } = req.body as { objectKey?: string; persona?: unknown };
    if (!objectKey || !persona) {
      return res.status(400).json({ error: "objectKey and persona are required." });
    }
    const key = normalizeKey(objectKey);
    const state = await loadState(key);
    if (!state) return res.status(404).json({ error: "Unknown object — awaken it first." });
    state.persona = persona as typeof state.persona;
    await saveState(state);
    res.json({ ok: true });
  } catch (err) {
    console.error("select-persona failed:", err);
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
    // Normalize so converse reads the same key space awaken wrote (the client
    // already sends the normalized persona.objectKey, but be robust to callers).
    const objectKey: string = normalizeKey(req.body.objectKey ?? "");
    const state = await loadState(objectKey);
    if (!state) return res.status(404).json({ error: "Unknown object — awaken it first." });

    // 1. What did the human say? (typed text wins; else transcribe the audio)
    const userText: string = req.body.text?.trim()
      ? req.body.text.trim()
      : req.file
        ? await transcribe(req.file.buffer, req.file.mimetype).catch(() => "")
        : "";
    if (!userText) {
      // Empty transcript (silence, a too-short clip, or an STT hiccup). Keep the
      // séance flowing with a gentle in-character nudge, not an error banner.
      return res.json({
        userText: "",
        replyText: "…I didn't quite catch that. Speak up, won't you?",
        audio: null,
        voiceModel: state.persona.voiceModel,
      });
    }

    // 2. The character replies, in persona, remembering the conversation.
    const replyText = await reply(state.persona, state.history, userText, state.encounters);

    // 3. Persist the exchange so the memory grows.
    state.history.push({ role: "user", text: userText });
    state.history.push({ role: "assistant", text: replyText });
    await saveState(state);
    await recordSession(state); // refresh the gallery preview/timestamp

    // 4. Voice it. A TTS failure must NOT lose the (already-generated) reply —
    //    degrade to null so the client still renders the text.
    const audio = await speak(replyText, state.persona.voiceModel).catch(() => null);

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
 * POST /api/tts
 * Body: { text: string, voiceModel?: string }
 * Returns { audio: string | null } — base64 mp3, or null when Deepgram is off.
 * Used by the encounter screen to speak pre-written lines in each persona's voice.
 */
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voiceModel } = req.body as { text?: string; voiceModel?: string };
    if (!text?.trim()) return res.status(400).json({ error: "text is required." });
    const audio = await speak(text.trim(), voiceModel ?? config.deepgramTtsModel).catch(() => null);
    res.json({ audio: audio ? audio.toString("base64") : null });
  } catch (err) {
    console.error("tts failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/encounter
 * Body: { objectKey1, objectKey2, dynamic? }
 * Generates a scripted 6-line scene between two awakened objects.
 * Returns { lines, relationship, persona1, persona2, portraitUrl1, portraitUrl2 }
 */
app.post("/api/encounter", async (req, res) => {
  try {
    const { objectKey1, objectKey2, dynamic } = req.body as { objectKey1: string; objectKey2: string; dynamic?: string };
    if (!objectKey1 || !objectKey2) {
      return res.status(400).json({ error: "objectKey1 and objectKey2 are required." });
    }
    const [state1, state2, savedDynamic] = await Promise.all([
      loadState(objectKey1),
      loadState(objectKey2),
      loadPairDynamic(objectKey1, objectKey2),
    ]);
    if (!state1) return res.status(404).json({ error: `Unknown object: ${objectKey1}` });
    if (!state2) return res.status(404).json({ error: `Unknown object: ${objectKey2}` });

    // Use the explicitly-passed dynamic, or fall back to whatever the pair used last.
    const effectiveDynamic = dynamic ?? savedDynamic ?? undefined;
    if (dynamic) await savePairDynamic(objectKey1, objectKey2, dynamic);

    const { lines, relationship } = await generateEncounter(state1.persona, state2.persona, effectiveDynamic);
    res.json({
      lines,
      relationship,
      persona1: state1.persona,
      persona2: state2.persona,
      portraitUrl1: state1.portraitUrl,
      portraitUrl2: state2.portraitUrl,
    });
  } catch (err) {
    console.error("encounter failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(config.port, () => {
  console.log(`\n🔮 Séance running → http://localhost:${config.port}\n`);
  logCapabilities();
  // Warm the Redis connection (or trip the in-memory fallback) at boot, so the
  // first user awaken doesn't pay the connect timeout mid-demo.
  void loadState("__warmup__").catch(() => {});
});
