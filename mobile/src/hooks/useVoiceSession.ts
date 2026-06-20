import { useCallback, useRef, useState } from "react";
import { configure, useDeepgramVoiceAgent } from "react-native-deepgram";
import { fetchVoiceToken, postTurns } from "../api";
import type { Persona, Turn } from "../types";

// Haiku is fast enough for a spoken voice loop; persona quality comes from systemPrompt.
const THINK_MODEL = "claude-haiku-4-5-20251001";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "user-speaking"
  | "agent-speaking"
  | "error";

export interface VoiceSession {
  status: VoiceStatus;
  transcript: Turn[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

/**
 * Wraps useDeepgramVoiceAgent with Séance-specific logic:
 * - Fetches a short-lived token from the backend before connecting
 * - Configures the agent with the object's persona (systemPrompt, voice, greeting)
 * - Seeds the LLM prompt with the last 3 exchanges so the object remembers prior chats
 * - Buffers turns per exchange and flushes them atomically on onAgentAudioDone to avoid
 *   the lost-update race when user+assistant ConversationText events arrive in rapid succession
 * - Skips persisting the greeting (backstory) so it doesn't contaminate history recaps
 *
 * This hook must only be called once the real Persona is available (not a placeholder),
 * so that defaultSettings and all callbacks close over the correct objectKey and systemPrompt.
 * See ConversationView in conversation.tsx for the correct call site.
 */
export function useVoiceSession(
  persona: Persona,
  priorHistory: Turn[],
): VoiceSession {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<Turn[]>(priorHistory);
  const [error, setError] = useState<string | null>(null);

  const configuredRef = useRef(false);
  // Set to true after the first assistant ConversationText (the greeting) fires,
  // so we can skip persisting it — it's not a real exchange turn.
  const greetingFiredRef = useRef(false);
  // Buffer turns within one exchange; flushed atomically on onAgentAudioDone.
  const pendingTurnsRef = useRef<Turn[]>([]);

  // Seed the system prompt with the last 3 exchanges so the object remembers prior chats.
  const buildThinkPrompt = (): string => {
    const recent = priorHistory.slice(-6);
    if (recent.length === 0) return persona.systemPrompt;
    const recap = recent
      .map((t) => `${t.role === "user" ? "Human" : persona.name}: ${t.text}`)
      .join("\n");
    return `${persona.systemPrompt}\n\nPrevious conversation (remember this):\n${recap}`;
  };

  const agent = useDeepgramVoiceAgent({
    autoStartMicrophone: true,
    autoPlayAudio: true,
    trackState: true,
    trackConversation: false,
    trackAgentStatus: true,

    defaultSettings: {
      audio: {
        input: { encoding: "linear16", sample_rate: 24000 },
        output: { encoding: "linear16", sample_rate: 24000, container: "none" },
      },
      agent: {
        listen: {
          provider: { type: "deepgram", model: "nova-3", smart_format: true },
        },
        think: {
          provider: { type: "anthropic", model: THINK_MODEL, temperature: 0.9 },
          prompt: buildThinkPrompt(),
        },
        speak: {
          provider: { type: "deepgram", model: persona.voiceModel },
        },
        greeting: persona.backstory,
      },
    },

    onConnect: () => setStatus("ready"),
    onClose: () => {
      setStatus("idle");
      configuredRef.current = false;
    },
    onError: (err) => {
      setError(String(err));
      setStatus("error");
    },
    onServerError: ({ code, description }) => {
      setError(`${code}: ${description}`);
      setStatus("error");
    },
    onUserStartedSpeaking: () => setStatus("user-speaking"),
    onAgentStartedSpeaking: () => setStatus("agent-speaking"),

    onAgentAudioDone: () => {
      setStatus("ready");
      // Flush the buffered turns for this exchange in one atomic write.
      const pending = pendingTurnsRef.current;
      if (pending.length > 0) {
        pendingTurnsRef.current = [];
        postTurns(persona.objectKey, pending).catch(console.warn);
      }
    },

    onConversationText: ({ role, content }) => {
      const turn: Turn = {
        role: role === "assistant" || role === "agent" ? "assistant" : "user",
        text: content,
      };
      // Always show in transcript.
      setTranscript((prev) => [...prev, turn]);

      // Skip persisting the opening greeting — it's persona.backstory, not a real
      // exchange turn. Storing it would contaminate the history recap with N copies
      // of the backstory after N sessions, crowding out real conversation context.
      if (turn.role === "assistant" && !greetingFiredRef.current) {
        greetingFiredRef.current = true;
        return;
      }
      pendingTurnsRef.current.push(turn);
    },
  });

  const connect = useCallback(async () => {
    try {
      setStatus("connecting");
      setError(null);

      if (!configuredRef.current) {
        const { token } = await fetchVoiceToken();
        configure({ apiKey: token });
        configuredRef.current = true;
      }

      await agent.connect();
    } catch (err) {
      setError(String(err));
      setStatus("error");
      configuredRef.current = false;
    }
  }, [agent]);

  const disconnect = useCallback(() => {
    agent.disconnect();
    configuredRef.current = false;
    greetingFiredRef.current = false;
    pendingTurnsRef.current = [];
    setStatus("idle");
  }, [agent]);

  return { status, transcript, error, connect, disconnect };
}
