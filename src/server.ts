import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, logCapabilities } from "./config.js";
import { awaken, reply, type ImageInput } from "./lib/claude.js";
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

    // 2. Has this object been awakened before? (memory / the "remembers you" beat)
    const prior = await loadState(persona.objectKey);

    // 3. Paint the portrait (skip if we already have one for this object).
    //    NOTE (Task 2): persona.objectRecognized is now available here — branch to a
    //    generated fallback portrait when it's false instead of using the raw photo.
    const portraitUrl = prior?.portraitUrl ?? (await paintPortrait(persona, image));

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

app.listen(config.port, () => {
  console.log(`\n🔮 Séance running → http://localhost:${config.port}\n`);
  logCapabilities();
});
