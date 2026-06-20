/**
 * Conversation screen — the live voice chat with the awakened object.
 *
 * For Task 3 integration: pass `objectKey` as a route param from your camera screen.
 *   router.push({ pathname: "/conversation", params: { objectKey: data.persona.objectKey } });
 *
 * Architecture: ConversationScreen (loading shell) → ConversationView (voice logic).
 * useVoiceSession is only called inside ConversationView, which mounts only after
 * personaData is available, so the hook never sees EMPTY_PERSONA.
 */
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchPersona, type PersonaResponse } from "../src/api";
import { useVoiceSession, type VoiceStatus } from "../src/hooks/useVoiceSession";
import type { Turn } from "../src/types";

// ── Status ring ──────────────────────────────────────────────────────────────

const RING_COLORS: Record<VoiceStatus, string> = {
  idle: "#3f3f60",
  connecting: "#a855f7",
  ready: "#22c55e",
  "user-speaking": "#38bdf8",
  "agent-speaking": "#c084fc",
  error: "#ef4444",
};

const STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: "Tap to awaken",
  connecting: "Connecting…",
  ready: "Listening",
  "user-speaking": "You're speaking",
  "agent-speaking": "Speaking…",
  error: "Connection failed",
};

function StatusRing({ status }: { status: VoiceStatus }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "agent-speaking" || status === "connecting") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [status, pulse]);

  const color = RING_COLORS[status];
  return (
    <Animated.View style={[s.ring, { borderColor: color, transform: [{ scale: pulse }] }]}>
      <View style={[s.ringInner, { backgroundColor: color + "22" }]}>
        <Text style={[s.ringIcon, { color }]}>
          {status === "agent-speaking" ? "🔊" : status === "user-speaking" ? "🎙️" : "🔮"}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Transcript line ───────────────────────────────────────────────────────────

function TurnLine({ turn, personaName }: { turn: Turn; personaName: string }) {
  const isUser = turn.role === "user";
  return (
    <View style={[s.turnRow, isUser ? s.turnRowUser : s.turnRowAgent]}>
      {!isUser && <Text style={s.turnSpeaker}>{personaName}</Text>}
      <View style={[s.turnBubble, isUser ? s.bubbleUser : s.bubbleAgent]}>
        <Text style={[s.turnText, isUser ? s.turnTextUser : s.turnTextAgent]}>
          {turn.text}
        </Text>
      </View>
    </View>
  );
}

// ── Loading shell ─────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { objectKey } = useLocalSearchParams<{ objectKey: string }>();
  const navigation = useNavigation();

  const [personaData, setPersonaData] = useState<PersonaResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectKey) return;
    fetchPersona(objectKey)
      .then((data) => {
        setPersonaData(data);
        navigation.setOptions({ title: data.persona.name });
      })
      .catch((err) => setLoadError(String(err)));
  }, [objectKey, navigation]);

  if (loadError) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.errorText}>{loadError}</Text>
          <Text style={s.hint}>
            Make sure the backend is running and the object has been awakened.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!personaData) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator color="#c084fc" size="large" />
          <Text style={s.loadingText}>Summoning…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <ConversationView personaData={personaData} />;
}

// ── Voice view — only mounts once persona is available ───────────────────────
// useVoiceSession is called here, never with EMPTY_PERSONA, so defaultSettings
// and the onConversationText closure both see the real persona from the start.

function ConversationView({ personaData }: { personaData: PersonaResponse }) {
  const { persona, portraitUrl, encounters } = personaData;

  const session = useVoiceSession(persona, personaData.history);
  const listRef = useRef<FlatList>(null);

  // Connect once on mount; disconnect on unmount. Persona is stable here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { session.connect(); return () => session.disconnect(); }, []);

  useEffect(() => {
    if (session.transcript.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [session.transcript.length]);

  const handleToggle = useCallback(() => {
    if (session.status === "idle" || session.status === "error") {
      session.connect();
    } else {
      session.disconnect();
    }
  }, [session]);

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      {/* Portrait + identity */}
      <View style={s.header}>
        <Image source={{ uri: portraitUrl }} style={s.portrait} resizeMode="cover" />
        <View style={s.identity}>
          <Text style={s.name}>{persona.name}</Text>
          <Text style={s.tagline}>{persona.tagline}</Text>
          {encounters > 1 && (
            <Text style={s.returning}>✨ Encounter #{encounters} — it remembers you</Text>
          )}
        </View>
      </View>

      {/* Status ring */}
      <View style={s.ringWrap}>
        <StatusRing status={session.status} />
        <Text style={[s.statusLabel, { color: RING_COLORS[session.status] }]}>
          {session.error ?? STATUS_LABELS[session.status]}
        </Text>
      </View>

      {/* Transcript */}
      <FlatList
        ref={listRef}
        style={s.transcript}
        data={session.transcript}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <TurnLine turn={item} personaName={persona.name} />}
        ListEmptyComponent={
          <Text style={s.emptyText}>
            {session.status === "connecting"
              ? "Establishing connection…"
              : "The conversation will appear here."}
          </Text>
        }
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      />

      {/* Connect / disconnect button */}
      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [
            s.endBtn,
            session.status === "idle" || session.status === "error"
              ? s.endBtnStart
              : s.endBtnStop,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleToggle}
        >
          <Text style={s.endBtnText}>
            {session.status === "idle" || session.status === "error"
              ? "Start conversation"
              : "End conversation"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0d0d1a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  errorText: { color: "#ef4444", fontSize: 16, textAlign: "center", marginBottom: 12 },
  loadingText: { color: "#c084fc", marginTop: 16, fontSize: 16 },
  hint: { color: "#555", fontSize: 13, textAlign: "center" },

  header: {
    flexDirection: "row",
    padding: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e3a",
  },
  portrait: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1e1e3a",
    borderWidth: 2,
    borderColor: "#7c3aed",
  },
  identity: { flex: 1, marginLeft: 14 },
  name: { color: "#e8d5ff", fontSize: 20, fontWeight: "700" },
  tagline: { color: "#888", fontSize: 13, marginTop: 2 },
  returning: { color: "#a855f7", fontSize: 11, marginTop: 4 },

  ringWrap: { alignItems: "center", paddingVertical: 24 },
  ring: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  ringInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  ringIcon: { fontSize: 32 },
  statusLabel: { fontSize: 13, fontWeight: "600", letterSpacing: 0.5 },

  transcript: { flex: 1 },
  emptyText: { color: "#444", textAlign: "center", marginTop: 32, fontSize: 14 },

  turnRow: { marginBottom: 12 },
  turnRowUser: { alignItems: "flex-end" },
  turnRowAgent: { alignItems: "flex-start" },
  turnSpeaker: { color: "#7c3aed", fontSize: 11, marginBottom: 3, marginLeft: 4 },
  turnBubble: { maxWidth: "80%", borderRadius: 16, padding: 12 },
  bubbleUser: { backgroundColor: "#1e1e3a" },
  bubbleAgent: { backgroundColor: "#2d1b4e" },
  turnText: { fontSize: 15, lineHeight: 20 },
  turnTextUser: { color: "#d1d5db" },
  turnTextAgent: { color: "#e8d5ff" },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: "#1e1e3a" },
  endBtn: { borderRadius: 10, padding: 16, alignItems: "center" },
  endBtnStart: { backgroundColor: "#7c3aed" },
  endBtnStop: { backgroundColor: "#1e1e3a", borderWidth: 1, borderColor: "#3f3f60" },
  endBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
