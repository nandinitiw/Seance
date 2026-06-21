/**
 * Conversation screen — the live voice séance with the awakened spirit.
 *
 * Route params: personaJson — JSON-stringified AwakenResponse
 *
 * Architecture: ConversationScreen (parse shell) → ConversationView (voice logic).
 * useVoiceSession is only called inside ConversationView, mounted after parsing,
 * so the hook never sees a null persona.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AwakenResponse } from "../src/api";
import {
  useVoiceSession,
  type VoiceStatus,
} from "../src/hooks/useVoiceSession";
import type { Turn } from "../src/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_BARS = 26;

// ── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(status: VoiceStatus): string {
  switch (status) {
    case "idle":
    case "connecting":
      return "awaiting your words";
    case "ready":
      return "awaiting your words";
    case "user-speaking":
      return "listening…";
    case "agent-speaking":
      return "speaking";
    default:
      return "channeling…";
  }
}

function micColor(status: VoiceStatus): string {
  if (status === "user-speaking") return "#34B7A0";
  if (status === "agent-speaking") return "#FF5A38";
  return "#2B241E";
}

function waveColor(status: VoiceStatus): string {
  if (status === "user-speaking") return "#34B7A0";
  if (status === "agent-speaking") return "#FF5A38";
  return "#5A4F42";
}

// ── Waveform component ────────────────────────────────────────────────────────

function Waveform({ status }: { status: VoiceStatus }) {
  const anims = useRef<Animated.Value[]>(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.25))
  ).current;

  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    // Stop previous animations
    loopsRef.current.forEach((l) => l.stop());
    loopsRef.current = [];

    const isActive =
      status === "user-speaking" || status === "agent-speaking";

    if (isActive) {
      anims.forEach((anim, i) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(i * 30),
            Animated.timing(anim, {
              toValue: 0.3 + Math.random() * 0.7,
              duration: 250 + Math.random() * 200,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.15 + Math.random() * 0.3,
              duration: 250 + Math.random() * 200,
              useNativeDriver: true,
            }),
          ])
        );
        loop.start();
        loopsRef.current.push(loop);
      });
    } else {
      // Settle bars to idle height
      anims.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.25,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }

    return () => {
      loopsRef.current.forEach((l) => l.stop());
    };
  }, [status]);

  const color = waveColor(status);

  return (
    <View style={wf.container}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            wf.bar,
            {
              backgroundColor: color,
              transform: [{ scaleY: anim }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const wf = StyleSheet.create({
  container: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  bar: {
    width: 3,
    height: 26,
    borderRadius: 2,
  },
});

// ── Thinking indicator ────────────────────────────────────────────────────────

function ThinkingDots() {
  const dots = useRef(
    Array.from({ length: 3 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const loops = dots.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(anim, {
            toValue: -6,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600 - i * 160),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View style={td.wrap}>
      <View style={td.dotsRow}>
        {dots.map((anim, i) => (
          <Animated.View
            key={i}
            style={[td.dot, { transform: [{ translateY: anim }] }]}
          />
        ))}
      </View>
      <Text style={td.label}>channeling</Text>
    </View>
  );
}

const td = StyleSheet.create({
  wrap: {
    alignItems: "flex-start",
    maxWidth: "88%",
    marginBottom: 12,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 5,
    backgroundColor: "#F2E9D6",
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D93D1A",
  },
  label: {
    fontFamily: "DMMono_400Regular",
    fontSize: 10,
    color: "#9b8e76",
    marginLeft: 4,
  },
});

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  turn,
  personaName,
}: {
  turn: Turn;
  personaName: string;
}) {
  const isUser = turn.role === "user";
  return (
    <View style={[cb.row, isUser ? cb.rowUser : cb.rowAgent]}>
      {!isUser && (
        <Text style={cb.agentLabel}>{personaName}</Text>
      )}
      <View
        style={[
          cb.bubble,
          isUser ? cb.bubbleUser : cb.bubbleAgent,
        ]}
      >
        <Text style={[cb.text, isUser ? cb.textUser : cb.textAgent]}>
          {turn.text}
        </Text>
      </View>
    </View>
  );
}

const cb = StyleSheet.create({
  row: {
    marginBottom: 14,
  },
  rowUser: {
    alignItems: "flex-end",
    maxWidth: "80%",
    alignSelf: "flex-end",
  },
  rowAgent: {
    alignItems: "flex-start",
    maxWidth: "88%",
    alignSelf: "flex-start",
  },
  agentLabel: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9,
    color: "#D6A94B",
    marginBottom: 4,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  bubble: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  bubbleAgent: {
    backgroundColor: "#F2E9D6",
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: "#2B241E",
    borderWidth: 0.75,
    borderColor: "#3A3128",
    borderTopRightRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  textAgent: {
    color: "#1C1813",
    fontFamily: "InstrumentSerif_400Regular",
  },
  textUser: {
    color: "#F0E7D6",
    fontFamily: "InstrumentSerif_400Regular",
  },
});

// ── Avatar aura ───────────────────────────────────────────────────────────────

function AvatarAura({ speaking }: { speaking: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (speaking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.2,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [speaking]);

  return (
    <Animated.View
      style={[
        av.aura,
        { opacity },
      ]}
      pointerEvents="none"
    />
  );
}

const av = StyleSheet.create({
  aura: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FF5A38",
    // Shadow glow approximation
    shadowColor: "#FF5A38",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
});

// ── Conversation view (voice logic) ──────────────────────────────────────────

function ConversationView({ result }: { result: AwakenResponse }) {
  const { persona, portraitUrl } = result;

  const session = useVoiceSession(persona, result.history);
  const listRef = useRef<FlatList<Turn>>(null);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  // Seed the first spirit message with the backstory
  const seedTurn: Turn = { role: "assistant", text: persona.backstory };

  // All displayed turns: seed + session transcript (skip first assistant if duplicate)
  const displayTurns: Turn[] = [seedTurn, ...session.transcript.filter(
    (t, i) => !(i === 0 && t.role === "assistant" && t.text === persona.backstory)
  )];

  // Connect on mount, disconnect on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    session.connect();
    return () => session.disconnect();
  }, []);

  // Scroll to end when new turns arrive
  useEffect(() => {
    if (displayTurns.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [displayTurns.length]);

  // Track thinking state
  useEffect(() => {
    setThinking(session.status === "connecting");
  }, [session.status]);

  const handleLeave = useCallback(() => {
    session.disconnect();
    router.back();
  }, [session]);

  const micDown = useCallback(() => {
    // Voice activity detection is automatic via Deepgram
    // onPressIn: visual feedback only — Deepgram auto-detects VAD
  }, []);

  const micUp = useCallback(() => {
    // onPressOut: visual feedback only
  }, []);

  const sendText = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    // We can't inject a text turn directly into the voice session,
    // so we display it locally as a user turn (UX feedback)
    // The actual sending would require a separate text endpoint;
    // for now we show it in the UI and reset.
    // If postTurns is desired, it can be wired up here.
  }, [draft]);

  const agentSpeaking = session.status === "agent-speaking";
  const userSpeaking = session.status === "user-speaking";
  const isActive = agentSpeaking || userSpeaking;

  function micCaption(): string {
    if (userSpeaking) return "release to send";
    if (agentSpeaking) return "tap to interrupt";
    return "press & hold to speak";
  }

  return (
    <SafeAreaView style={cv.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={cv.header}>
        <View style={cv.avatarWrap}>
          <AvatarAura speaking={agentSpeaking} />
          <Image
            source={{ uri: portraitUrl }}
            style={cv.avatar}
            resizeMode="cover"
          />
        </View>
        <View style={cv.identity}>
          <Text style={cv.name}>{persona.name}</Text>
          <Text style={cv.statusLabel}>{statusLabel(session.status)}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [cv.leaveBtn, pressed && { opacity: 0.7 }]}
          onPress={handleLeave}
        >
          <Text style={cv.leaveBtnText}>LEAVE</Text>
        </Pressable>
      </View>

      {/* Error banner */}
      {session.error && (
        <View style={cv.errorBanner}>
          <Text style={cv.errorText}>{session.error}</Text>
        </View>
      )}

      {/* Chat messages */}
      <FlatList<Turn>
        ref={listRef}
        style={cv.list}
        data={displayTurns}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <ChatBubble turn={item} personaName={persona.name} />
        )}
        contentContainerStyle={cv.listContent}
        ListFooterComponent={thinking ? <ThinkingDots /> : null}
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom bar */}
      <View style={cv.bottomBar}>
        {/* Waveform */}
        <Waveform status={session.status} />
        <Text style={cv.micCaption}>{micCaption()}</Text>

        {/* Text input row */}
        <View style={cv.inputRow}>
          <TextInput
            style={cv.textInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="type a message…"
            placeholderTextColor="#5A4F42"
            returnKeyType="send"
            onSubmitEditing={sendText}
            multiline={false}
          />
          {draft.trim().length > 0 && (
            <Pressable
              style={({ pressed }) => [cv.sendBtn, pressed && { opacity: 0.8 }]}
              onPress={sendText}
            >
              <Text style={cv.sendBtnText}>SEND</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              cv.micBtn,
              { backgroundColor: micColor(session.status) },
              pressed && { opacity: 0.85 },
            ]}
            onPressIn={micDown}
            onPressOut={micUp}
          >
            <Text style={cv.micIcon}>
              {userSpeaking ? "🎙" : agentSpeaking ? "🔊" : "🎤"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Root screen ───────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { personaJson } = useLocalSearchParams<{ personaJson: string }>();

  let result: AwakenResponse | null = null;
  try {
    result = JSON.parse(personaJson ?? "null") as AwakenResponse;
  } catch {
    // handled below
  }

  if (!result) {
    return (
      <SafeAreaView style={cv.safe}>
        <View style={cv.center}>
          <Text style={cv.errorText}>Could not load spirit data.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <ConversationView result={result} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cv = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0d0a08",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorText: {
    color: "#D93D1A",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "DMMono_400Regular",
  },
  errorBanner: {
    backgroundColor: "rgba(217,61,26,0.12)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#7A1F0C",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2B241E",
  },
  avatarWrap: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#D6A94B",
    backgroundColor: "#2B241E",
  },
  identity: {
    flex: 1,
    marginLeft: 12,
    gap: 3,
  },
  name: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 24,
    color: "#F0E7D6",
    lineHeight: 28,
  },
  statusLabel: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9,
    letterSpacing: 1.5,
    color: "#D6A94B",
  },
  leaveBtn: {
    borderWidth: 1,
    borderColor: "#3A3128",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  leaveBtnText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 10,
    color: "#A89A86",
    letterSpacing: 0.5,
  },

  // Chat list
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#2B241E",
    backgroundColor: "#140f0c",
    gap: 8,
  },
  micCaption: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9,
    color: "#7a6e5c",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 48,
    backgroundColor: "#1C1611",
    borderWidth: 1,
    borderColor: "#3A3128",
    borderRadius: 10,
    paddingHorizontal: 14,
    color: "#F0E7D6",
    fontSize: 14,
    fontFamily: "InstrumentSerif_400Regular",
  },
  sendBtn: {
    backgroundColor: "#D93D1A",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 11,
    color: "#F0E7D6",
    letterSpacing: 1,
  },
  micBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#D6A94B",
  },
  micIcon: {
    fontSize: 22,
  },
});
