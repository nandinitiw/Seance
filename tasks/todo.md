# Task 4 — Real-time Voice + Barge-in (Deepgram Voice Agent)

Branch: `feature/voice`

## Context — what already exists (don't rebuild)
- Repo = Node/Express backend (`src/`). The web frontend (`public/`) is being **removed** — Express becomes a pure headless backend/API for the Expo app. (Keep `public/` alive as a smoke-test until the Expo voice path works — see Risks.)
- Persona shape pinned in `src/types.ts` (Task 1 contract). The two fields we use: `systemPrompt`, `voiceModel`.
- Claude in-character `reply()` already in `src/lib/claude.ts`.
- Memory (Task 2) already wired into `/api/converse` via `src/lib/memory.ts` (`loadState`/`saveState`, `Turn[]` history).
- `/api/converse` (`src/server.ts:69`) = a **working turn-based** voice loop (Deepgram STT → Claude → Deepgram TTS, REST). **Keep it as the Expo demo fallback** (record clip → POST → play mp3 via expo-audio).

## Decisions (locked)
- **Frontend = Expo / React Native only.** `public/` gets deleted once Expo voice works; Express drops `express.static` and becomes headless.
- **Engine = Deepgram Voice Agent API** — one WebSocket does STT + LLM + TTS + turn-taking; **barge-in is native**.
- **Client lib = `react-native-deepgram`** → `useDeepgramVoiceAgent` (mic PCM capture + agent audio playback + iOS echo cancellation via AVAudioEngine). Methods: `connect()`, `disconnect()`, `injectUserMessage()`, `updatePrompt()`, `sendFunctionCallResponse()`. Accepts `endpoint` + `defaultSettings` (`agent.think.provider`/`prompt`, `agent.listen`, `agent.speak`).
  - Fallback lib if it disappoints: `@mykin-ai/expo-audio-stream` (raw PCM capture + `playAudio()` + `clearPlaybackQueueByTurnId()` — manual barge-in primitive).
- **Connection = app-direct to Deepgram** (recommended) + server **token-grant** so the raw Deepgram key isn't in the app binary. Persona injected from the app via agent settings; memory persisted via REST to our server.
  - Alt: point the lib's `endpoint` at an Express **WS relay** if we want keys + persona + memory fully server-side. More secure, more code.
- LLM mapping: `agent.think.provider = anthropic`, `agent.think.prompt = persona.systemPrompt` (+ memory note). Voice: `agent.speak = persona.voiceModel` (aura-2-*). Greeting: `persona.backstory`. STT: `agent.listen` = nova-3.
- **Requires a custom dev build** (`npx expo prebuild`) — NOT Expo Go.

## Assumptions (resolved)
- Expo app is **greenfield** (none exists yet). Task 4 delivers: the backend additions below + a self-contained voice module (a thin wrapper around `useDeepgramVoiceAgent`) + a minimal test screen so voice is demoable on its own, to be wired into Task 3's conversation screen when it lands. If Task 3 already started an Expo app, point Sonnet at it and skip the scaffold step.
- Repo layout: Expo app as a `mobile/` subfolder of this repo (simplest to run both) or a separate repo — either is fine.

## Plan

### Phase 0 — De-risk first (20–30 min)
- [ ] **YOU RUN:** cd mobile && npm install && npx expo prebuild && npx expo run:ios
- [ ] Open `app/index.tsx`, enter any objectKey (even "demo-object"), tap "Awaken it" → conversation screen loads.
- [ ] Confirm `useDeepgramVoiceAgent` connects and barge-in works on a real device.

### Phase 1 — Backend ✅ DONE
- [x] `POST /api/voice-token` → mints a 1-hour Deepgram token (mock if no key).
- [x] `GET /api/persona/:objectKey` → returns persona + history for the mobile screen.
- [x] `POST /api/turn { objectKey, role, text }` → appends to Redis history.
- [x] `POST /api/awaken` now also returns `history` in its response.
- [x] `/api/converse` left intact as turn-based fallback.

### Phase 2 — Expo client ✅ DONE (code written, needs `npm install` + prebuild)
- [x] `mobile/` scaffolded with Expo SDK 52 + expo-router.
- [x] `react-native-deepgram` in package.json; config plugin in `app.config.js` (auto-handles iOS mic permission).
- [x] `mobile/src/hooks/useVoiceSession.ts` — main deliverable. Wraps `useDeepgramVoiceAgent` with: token fetch → `configure()` → `connect()`; persona systemPrompt + memory seeding; `ConversationText` → transcript + `POST /api/turn`.
- [x] `mobile/app/conversation.tsx` — voice UI: portrait, status ring (animated), scrolling transcript, connect/disconnect.
- [x] `mobile/app/index.tsx` — standalone test launcher (Task 3 replaces this with camera screen).
- [x] `mobile/.env.example` — set `EXPO_PUBLIC_API_URL` to laptop LAN IP for on-device testing.

### YOU STILL NEED TO RUN:
```bash
cd mobile
npm install           # install deps
cp .env.example .env
# Edit .env: EXPO_PUBLIC_API_URL=http://<your-laptop-LAN-IP>:3000
npx expo prebuild     # generate ios/ and android/ dirs (native build required)
npx expo run:ios      # build and install on connected iPhone
```

### Phase 3 — Integration + fallback + cleanup
- [ ] Wire `useVoiceSession` into Task 3's conversation screen — it's a drop-in hook, needs `(persona, priorHistory)`.
- [ ] Reliable fallback path: record a clip (expo-av) → `/api/converse` → play returned mp3.
- [ ] **Only after** Expo voice is proven on a device: delete `public/`, remove `express.static` from `src/server.ts`.

### Phase 4 — Real-phone test (Definition of Done)
- [ ] Backend: `npm run dev` in repo root; phone on same Wi-Fi → `http://<laptop-IP>:3000`.
- [ ] DoD: talk out loud → in-character voice reply → interrupt mid-sentence ≥1× without breaking.
- [ ] Pre-test 2–3 known-good objects. Demo with earbuds as echo insurance.

## API keys
- **Deepgram** ✅ have it (Voice Agent WS + STT/TTS). **Anthropic** ✅ team's key (the `think` step; in server `.env` as `ANTHROPIC_API_KEY`). **Redis** optional (Task 2; in-memory Map fallback). **No new keys.**
- Confirm at Deepgram booth whether the managed Anthropic provider is billed via Deepgram or wants your Anthropic key in the agent Settings.

## Risks / watch-list
- **Dev build required** (no Expo Go) — budget setup + EAS/prebuild time; this is the most likely time sink.
- **Full-duplex echo/feedback** → agent hears itself → false barge-in. Mitigated by the lib's AVAudioEngine AEC; earbuds as demo backup.
- **Voice Agent schema iterates** — verify endpoint path + Settings field names against current Deepgram docs before coding.
- **Don't delete `public/` prematurely.** It's currently the only working end-to-end demo (awaken→converse→voice). Keep it as a reference + smoke-test harness until the Expo voice path is proven on a device, *then* remove it (Phase 3).

## References
- Voice Agent: https://developers.deepgram.com/docs/voice-agent · Settings: https://developers.deepgram.com/docs/voice-agent-settings · LLM providers (Anthropic): https://developers.deepgram.com/docs/voice-agent-llm-models · Barge-in: https://developers.deepgram.com/docs/voice-agent-user-started-speaking
- `react-native-deepgram`: https://github.com/itsRares/react-native-deepgram · RN E2E voice walkthrough: https://denieler.com/blog/deepgram-integration-react-native
