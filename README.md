# 🔮 Séance

**Point your phone at *any* object and it wakes up as a character you can have a live voice conversation with.**

Hand a judge their own water bottle and let them argue with it. That laugh is the demo.

Built for HackBerkeley AI Hackathon 2026 — **Ddoski's Playground** track.

---

## The 10-second pitch

> Séance is a spirit medium for objects. Point the camera at a stapler, a mug, a backpack — Claude looks at it, invents the larger-than-life character secretly living inside, paints its portrait, gives it a voice, and lets you talk to it out loud. And it *remembers you* the next time you point the camera at the same thing.

## How it works (4 hops, 4 sponsors)

```
 📷 camera frame
     │
     ▼
 🧠 Claude (vision)         invents a PERSONA — name, backstory, voice, system prompt
     │   Anthropic           (structured output → validated JSON, not prose)
     ▼
 🎨 image gen               paints the character PORTRAIT
     │   Adobe / Midjourney  (mock = the captured photo as the portrait)
     ▼
 🗣️  Deepgram               you speak → it hears (STT); it replies → you hear (TTS)
     │                       in the character's own voice
     ▼
 🧠 Claude (chat)           replies IN CHARACTER, remembering the conversation
     │   Anthropic
     ▼
 💾 Redis                   the SAME object remembers you across sessions
```

Each hop is one file in `src/lib/`. Own a hop, ignore the rest.

## Sponsor prize stacking

| Sponsor | Where it's used | File |
|---|---|---|
| **Anthropic** (Claude Opus 4.8) | Vision→persona + in-character replies | `src/lib/claude.ts` |
| **Deepgram** | Speech-to-text + text-to-speech voice | `src/lib/deepgram.ts` |
| **Adobe / Midjourney** | Character portrait generation | `src/lib/imagegen.ts` |
| **Redis** | Cross-session object memory | `src/lib/memory.ts` |

---

## Quickstart

```bash
npm install
cp .env.example .env     # works empty — every key is optional
npm run dev              # → API on http://localhost:3000
```

This starts the **API server** only. The user-facing client is the Expo phone
app in [`app/`](app/) — see [app/README.md](app/README.md) to run it on a phone.

> **It runs with zero API keys.** With no `.env`, every hop falls back to a mock:
> the persona is canned and the portrait is a stylized version of your photo. Build
> the UX first, then add keys one at a time and watch each hop go `mock → live`
> (the server logs which).

### Adding the real sponsors

Fill these into `.env` as you collect them at the booths:

- `ANTHROPIC_API_KEY` → real, object-specific personalities (the heart of it)
- `DEEPGRAM_API_KEY` → real spoken voices (in mock mode replies are text-only)
- `IMAGE_PROVIDER=firefly` + Adobe creds, or `=midjourney` + a proxy → real portraits
- `REDIS_URL` → memory that survives a restart (use the Redis booth's instance)

---

## Project layout

```
src/
  server.ts          Express API: /api/awaken and /api/converse
  config.ts          all env reading + capability flags in one place
  types.ts           Persona / Turn / SessionState
  lib/
    claude.ts        vision → persona, and in-character replies   (Anthropic)
    deepgram.ts      transcribe() + speak()                        (Deepgram)
    imagegen.ts      paintPortrait() with provider switch          (Adobe/MJ)
    memory.ts        loadState()/saveState() keyed by object       (Redis)
app/
  Expo (React Native) phone client — capture → reveal → talk. See app/README.md
```

## API

- `POST /api/awaken` — body `{ image: dataURL }` → `{ persona, portraitUrl, encounters, returning }`
- `POST /api/converse` — multipart `objectKey` + (`audio` file or `text`) → `{ userText, replyText, audio }`

---

## 24-hour scope (what to build, what to skip)

**Build:** the awaken → talk loop with great persona writing. That's the whole demo.

**Skip (on purpose):**
- ❌ Real-time barge-in — the hold-to-talk turn loop is plenty. (Upgrade: Deepgram Voice Agent API, noted in `deepgram.ts`.)
- ❌ Portrait *animation* — a static character portrait sells it. Spend time on the prompt, not rigging.
- ❌ Accounts / DB schema — Redis keyed by `objectKey` *is* the persistence.

**The one moment to protect:** handing someone an object and watching them react to its voice. Rehearse that.

## Demo script (90 seconds)

1. Point at a mundane object on the judges' table. **Awaken.**
2. Let it introduce itself (the backstory line auto-speaks).
3. Hand a judge the mic: "ask it anything."
4. Point the camera at the **same** object again → "✨ It remembers you."
5. Awaken something absurd (a shoe, a charger) for the laugh.

## Upgrade paths (for "we used it for real" judge points)

- **Deepgram Voice Agent API** → one WebSocket, real-time turn-taking + barge-in.
- **Redis Agent Memory Server** → semantic long-term memory; the object remembers *topics* across many strangers.
- **Adobe Firefly Services** → branded, consistent character art.

---

Made at HackBerkeley 2026. Go talk to your stapler.
