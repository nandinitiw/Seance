import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import { converse, type AwakenResponse } from "../api";
import type { Turn } from "../types";

/**
 * Voice loop for the séance, REST hold-to-talk:
 *   record (expo-av) → POST /api/converse (Deepgram STT → Claude → Deepgram TTS)
 *   → play the returned mp3.
 *
 * Replaces the Deepgram Voice Agent WebSocket path: that requires a token-grant
 * scope this project's key doesn't have (403), and pulls in a native module that
 * crashes the New-Arch build. This path needs only Deepgram's STT/TTS REST APIs,
 * which work with the same key, plus expo-av. The server persists each exchange
 * to memory itself, so the client never posts turns separately.
 *
 * Status strings match the old VoiceStatus union so the conversation UI's
 * colour/label/waveform helpers keep working unchanged:
 *   idle           — resting
 *   user-speaking  — actively recording the human
 *   connecting     — waiting on /api/converse (the "channeling…" thinking state)
 *   agent-speaking — playing the spoken reply
 *   error          — last action failed
 */
export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "user-speaking"
  | "agent-speaking"
  | "error";

export interface ConverseSession {
  status: VoiceStatus;
  turns: Turn[];
  error: string | null;
  micDenied: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
}

export function useConverse(result: AwakenResponse): ConverseSession {
  const { persona } = result;

  // Open with the backstory line, then any remembered prior turns.
  const [turns, setTurns] = useState<Turn[]>(() => [
    { role: "assistant", text: persona.backstory },
    ...result.history,
  ]);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const mounted = useRef(true);
  // Guards the press/release race: startRecording is async (permission + audio
  // mode + createAsync take 100-500ms). startPromiseRef lets stopRecording wait
  // for it; stopRequestedRef lets startRecording abort if the finger already
  // lifted, so a quick tap never leaves a recording running with no way to stop.
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // already gone
      }
      soundRef.current = null;
    }
  }, []);

  const playReply = useCallback(
    async (base64: string) => {
      await stopSound();
      // Route audio to the speaker, not the recording session.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${base64}` },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        if (mounted.current) setStatus("agent-speaking");
        sound.setOnPlaybackStatusUpdate((s) => {
          if (!s.isLoaded) return;
          if (s.didJustFinish) {
            stopSound();
            if (mounted.current) setStatus("idle");
          }
        });
      } catch {
        // Playback failure is non-fatal — the reply text is already on screen.
        if (mounted.current) setStatus("idle");
      }
    },
    [stopSound],
  );

  const send = useCallback(
    async (input: { audioUri?: string; text?: string }) => {
      if (!mounted.current) return;
      setError(null);
      setStatus("connecting");
      try {
        const data = await converse({ objectKey: persona.objectKey, ...input });
        if (!mounted.current) return;
        const next: Turn[] = [];
        if (data.userText?.trim()) next.push({ role: "user", text: data.userText });
        next.push({ role: "assistant", text: data.replyText });
        setTurns((prev) => [...prev, ...next]);
        if (data.audio) {
          await playReply(data.audio);
        } else if (mounted.current) {
          setStatus("idle");
        }
      } catch (e: any) {
        if (mounted.current) {
          setError(e?.message || "The connection wavered. Try again.");
          setStatus("error");
        }
      }
    },
    [persona.objectKey, playReply],
  );

  const startRecording = useCallback(async () => {
    stopRequestedRef.current = false;
    setError(null);
    const run = (async () => {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) {
          setMicDenied(true);
          return;
        }
        setMicDenied(false);
        await stopSound(); // interrupt the spirit if it's mid-sentence (barge-in)
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        // Finger already lifted while we were setting up? Don't start a recording
        // that nothing is waiting to stop (the quick-tap race).
        if (stopRequestedRef.current || !mounted.current) return;
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        if (mounted.current) setStatus("user-speaking");
      } catch (e: any) {
        recordingRef.current = null;
        if (mounted.current) {
          setStatus("idle");
          setError(e?.message || "Couldn't start the recording.");
        }
      }
    })();
    startPromiseRef.current = run;
    await run;
  }, [stopSound]);

  const stopRecording = useCallback(async () => {
    stopRequestedRef.current = true;
    // Wait for any in-flight start so we either get the recording or learn it
    // aborted — otherwise a fast tap leaves a recording running with no stop.
    if (startPromiseRef.current) {
      try {
        await startPromiseRef.current;
      } catch {
        // start already surfaced its own error
      }
    }
    const rec = recordingRef.current;
    if (!rec) return; // fast tap aborted, or permission denied — nothing to send
    recordingRef.current = null;
    let uri: string | null = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch {
      // device hiccup
    }
    if (!uri) {
      if (mounted.current) setStatus("idle");
      return;
    }
    await send({ audioUri: uri });
  }, [send]);

  const sendText = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      await send({ text: t });
    },
    [send],
  );

  return {
    status,
    turns,
    error,
    micDenied,
    startRecording,
    stopRecording,
    sendText,
  };
}
