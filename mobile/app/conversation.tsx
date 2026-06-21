/**
 * Conversation screen — the live voice séance with the awakened spirit.
 *
 * Reads the awakened spirit (AwakenResponse) from sessionStore, not nav params.
 *
 * Architecture: ConversationScreen (store read) → ConversationView (voice logic).
 * useConverse is only called inside ConversationView, mounted after parsing,
 * so the hook never sees a null persona. Voice is REST hold-to-talk:
 * record → POST /api/converse (STT → Claude → TTS) → play the mp3 reply.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
import { sessionStore } from "../src/sessionStore";
import {
  useConverse,
  type VoiceStatus,
} from "../src/hooks/useConverse";
import type { Turn } from "../src/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_BARS = 26;

// ── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(status: VoiceStatus): string {
  switch (status) {
    case "user-speaking":
      return "listening…";
    case "agent-speaking":
      return "speaking";
    case "connecting":
      return "channeling…";
    case "error":
      return "the connection wavered";
    default:
      return "awaiting your words";
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
    gap: 3,
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

// Stage directions (*...*) shape the spirit's tone but aren't shown: the backend
// strips them from speech, we strip them from the transcript. Fall back to the
// raw text if a turn is *only* a direction, so a bubble is never empty.
function stripStageDirections(text: string): string {
  const cleaned = text
    .replace(/\*[^*]*\*/g, " ")
    .replace(/\s+([,.!?;:…])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || text;
}

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
          {stripStageDirections(turn.text)}
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
    letterSpacing: 1.5,
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
    fontSize: 14,
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
  const morph = useRef(new Animated.Value(0)).current;

  // opacity and the morphing borderRadius drive the SAME Animated.View. RN forbids
  // mixing drivers on one node, and borderRadius can't use the native driver — so
  // every animation here must be useNativeDriver: false, or it crashes with
  // "JS driven animation on animated node that has been moved to native earlier".
  useEffect(() => {
    if (speaking) {
      const opacityLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.75, duration: 700, useNativeDriver: false }),
          Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: false }),
        ])
      );
      const morphLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(morph, { toValue: 1, duration: 2400, useNativeDriver: false }),
          Animated.timing(morph, { toValue: 0, duration: 2400, useNativeDriver: false }),
        ])
      );
      opacityLoop.start();
      morphLoop.start();
      return () => { opacityLoop.stop(); morphLoop.stop(); };
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: false }).start();
      morph.setValue(0);
    }
  }, [speaking]);

  const borderRadiusTL = morph.interpolate({ inputRange: [0, 1], outputRange: [28, 22] });
  const borderRadiusTR = morph.interpolate({ inputRange: [0, 1], outputRange: [22, 32] });
  const borderRadiusBL = morph.interpolate({ inputRange: [0, 1], outputRange: [32, 26] });
  const borderRadiusBR = morph.interpolate({ inputRange: [0, 1], outputRange: [24, 30] });

  return (
    <Animated.View
      style={[
        av.aura,
        {
          opacity,
          borderTopLeftRadius: borderRadiusTL,
          borderTopRightRadius: borderRadiusTR,
          borderBottomLeftRadius: borderRadiusBL,
          borderBottomRightRadius: borderRadiusBR,
        },
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
    backgroundColor: "#FF5A38",
    // Shadow glow approximation
    shadowColor: "#FF5A38",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
});

// ── Mic icon ─────────────────────────────────────────────────────────────────

function MicIcon({ status }: { status: VoiceStatus }) {
  const isListening = status === 'user-speaking';
  const isSpeaking = status === 'agent-speaking';

  if (isSpeaking) {
    // Stop square icon
    return (
      <View style={{
        width: 15, height: 15, borderRadius: 3,
        backgroundColor: '#160F0C',
      }} />
    );
  }

  const color = isListening ? '#160F0C' : '#D6A94B';
  return (
    <View style={{ alignItems: 'center' }}>
      {/* Capsule top */}
      <View style={{
        width: 11, height: 17,
        borderRadius: 6,
        backgroundColor: color,
      }} />
      {/* Arc */}
      <View style={{
        width: 17, height: 7,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        borderRightWidth: 2,
        borderColor: color,
        borderBottomLeftRadius: 9,
        borderBottomRightRadius: 9,
        marginTop: -3,
      }} />
      {/* Stem */}
      <View style={{
        width: 2, height: 4,
        backgroundColor: color,
        marginTop: 1,
      }} />
    </View>
  );
}

// ── Conversation view (voice logic) ──────────────────────────────────────────

function ConversationView({ result }: { result: AwakenResponse }) {
  const { persona, portraitUrl } = result;

  const session = useConverse(result);
  const listRef = useRef<FlatList<Turn>>(null);
  const [draft, setDraft] = useState("");
  const micScale = useRef(new Animated.Value(1)).current;

  const displayTurns = session.turns;
  const thinking = session.status === "connecting";
  const busy = thinking; // block new input while a reply is in flight

  // Scroll to the latest turn as the log grows or while channeling.
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [displayTurns.length, thinking]);

  const handleLeave = useCallback(() => {
    // Audio teardown is handled by useConverse's unmount cleanup.
    router.back();
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    session.sendText(text);
  }, [draft, busy, session]);

  const agentSpeaking = session.status === "agent-speaking";
  const userSpeaking = session.status === "user-speaking";
  const isActive = agentSpeaking || userSpeaking;

  useEffect(() => {
    if (isActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(micScale, { toValue: 1.07, duration: 600, useNativeDriver: true }),
          Animated.timing(micScale, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      micScale.setValue(1);
    }
  }, [isActive]);

  function micCaption(): string {
    if (userSpeaking) return "release to send";
    if (agentSpeaking) return "tap to interrupt";
    return "press & hold to speak";
  }

  return (
    <SafeAreaView style={cv.safe} edges={["top", "bottom"]}>
      <LinearGradient
        colors={['#231B15', '#0d0a08']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Image
        source={require('../assets/grain.png')}
        style={[StyleSheet.absoluteFillObject, { opacity: 0.25 }]}
        resizeMode="repeat"
      />
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
      {(session.error || session.micDenied) && (
        <View style={cv.errorBanner}>
          <Text style={cv.errorText}>
            {session.micDenied
              ? "Microphone access is off — enable it in Settings, or type below."
              : session.error}
          </Text>
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
        {/* Waveform row */}
        <View style={cv.waveRow}>
          <View style={{ flex: 1 }}>
            <Waveform status={session.status} />
          </View>
          <Text style={cv.micCaption}>{micCaption()}</Text>
        </View>

        {/* Text input row */}
        <View style={cv.inputRow}>
          <TextInput
            style={cv.textInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="type a message…"
            placeholderTextColor="#5A4F42"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!busy}
            multiline={false}
          />
          {draft.trim().length > 0 && (
            <Pressable
              style={({ pressed }) => [cv.sendBtn, pressed && { opacity: 0.8 }]}
              onPress={handleSend}
            >
              <Text style={cv.sendBtnText}>SEND</Text>
            </Pressable>
          )}
          <Animated.View style={{ transform: [{ scale: micScale }] }}>
            <Pressable
              style={({ pressed }) => [
                cv.micBtn,
                { backgroundColor: micColor(session.status) },
                isActive && {
                  shadowColor: micColor(session.status),
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 12,
                  elevation: 8,
                },
                pressed && { opacity: 0.85 },
              ]}
              onPressIn={session.startRecording}
              onPressOut={session.stopRecording}
              disabled={busy}
            >
              <MicIcon status={session.status} />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Root screen ───────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const result = sessionStore.getResult();

  if (!result) {
    return (
      <SafeAreaView style={cv.safe}>
        <LinearGradient
          colors={['#231B15', '#0d0a08']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={cv.center}>
          <Text style={cv.errorText}>Could not load spirit data.</Text>
          <Pressable
            style={({ pressed }) => [cv.recoverBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.replace('/')}
          >
            <Text style={cv.recoverBtnText}>Summon another →</Text>
          </Pressable>
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
    backgroundColor: 'transparent',
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
  recoverBtn: {
    marginTop: 22,
    backgroundColor: "#D93D1A",
    borderWidth: 1,
    borderColor: "#7A1F0C",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 30,
  },
  recoverBtnText: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 19,
    color: "#F0E7D6",
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
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: 'visible',
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
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  leaveBtnText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 10,
    color: "#A89A86",
    letterSpacing: 1,
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
    borderRadius: 12,
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
    borderWidth: 2,
    borderColor: "#D6A94B",
  },
  waveRow: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
