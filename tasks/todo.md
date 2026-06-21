# Task — object-matched voices + stage-direction tone

Branch: `feature/voices-and-tone`

## Decisions (from user)
- Stage directions `*...*`: **hide completely** — strip from BOTH speech (TTS) and the on-screen transcript. Claude is prompted to produce them (shapes expressive delivery), then they're removed.
- Voices: **deterministic + varied** — stable per-object hash into archetype-matched aura-2 pools. No dependence on Claude's pick; never collapses to one default.

## Plan
- [x] `claude.ts`: archetype→voice pools (validated aura-2 ids) + `pickVoice(archetype, objectKey)` deterministic hash; export it.
- [x] `claude.ts` `reply()`: append a delivery note so replies sound natural and include <=1 short `*stage direction*`.
- [x] `deepgram.ts`: `stripStageDirections()` + apply inside `speak()` (never vocalize `*...*`; skip TTS if nothing left).
- [x] `server.ts` `/api/awaken`: after objectKey is finalized, set `persona.voiceModel = pickVoice(...)`.
- [x] `mobile/app/conversation.tsx`: strip `*...*` in `ChatBubble` render, fall back to raw if a turn is only a direction.
- [x] Verify: 38 aura-2 voices validated; typecheck clean; live test passed.

## Review
- Voice variety proven: two objects of the same archetype (dramatic_diva) → `athena` vs `cordelia`. Deterministic + stable per objectKey.
- Stage directions: raw reply `*gasps dramatically* Who am I? Darling...` → spoken/shown as `Who am I? Darling...`; audio (118KB) synthesized from the cleaned text. No asterisks vocalized.
- History keeps RAW replies (Claude sees its own style); display + TTS strip at the edges.
- Returning objects reuse `prior.persona`, so an established object's voice never changes.
