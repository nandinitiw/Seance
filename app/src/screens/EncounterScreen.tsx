import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { converse, encounter } from "../api/client";
import { resolveMediaUrl } from "../config";
import { colors, font, radius, spacing } from "../theme";
import type { EncounterLine } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Encounter">;

const PORTRAIT_SIZE = 130;

const REPLAY_DYNAMICS = [
  { label: "✨ Fate decides", value: undefined },
  { label: "⚔️ Rivals",       value: "rivals" },
  { label: "💘 Star-crossed",  value: "unexpected attraction and flirtation" },
  { label: "🤝 Best friends",  value: "instant best friends who have found their soulmate" },
  { label: "😬 Awkward",       value: "one-sided obsession while the other is totally indifferent" },
  { label: "🎓 Mentor",        value: "mentor and student, where one immediately tries to dominate and teach" },
];

export default function EncounterScreen({ route, navigation }: Props) {
  const { persona1, persona2, portraitUrl1, portraitUrl2 } = route.params;

  // Lines and relationship live in local state so replays can swap them.
  const [lines, setLines] = useState<EncounterLine[]>(route.params.lines);
  const [relationship, setRelationship] = useState(route.params.relationship);
  const [replayLoading, setReplayLoading] = useState(false);

  const [currentLine, setCurrentLine] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const mounted = useRef(true);

  const glow1 = useRef(new Animated.Value(0)).current;
  const glow2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const activateGlow = useCallback((speaker: "object1" | "object2") => {
    const active = speaker === "object1" ? glow1 : glow2;
    const inactive = speaker === "object1" ? glow2 : glow1;
    inactive.setValue(0);
    Animated.timing(active, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  }, [glow1, glow2]);

  const playLines = useCallback(async (sceneLines: EncounterLine[], index: number) => {
    if (!mounted.current) return;
    const line = sceneLines[index];
    if (!line) { setDone(true); setPlaying(false); return; }

    setCurrentLine(index);
    activateGlow(line.speaker);

    const persona = line.speaker === "object1" ? persona1 : persona2;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      const data = await converse({ objectKey: persona.objectKey, text: line.text });
      if (!mounted.current) return;

      if (data.audio) {
        if (soundRef.current) await soundRef.current.unloadAsync().catch(() => {});
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${data.audio}` },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              sound.unloadAsync().catch(() => {});
              resolve();
            }
          });
        });
      } else {
        await new Promise((r) => setTimeout(r, 2200));
      }
    } catch {
      await new Promise((r) => setTimeout(r, 2200));
    }

    if (mounted.current) playLines(sceneLines, index + 1);
  }, [persona1, persona2, activateGlow]);

  const startScene = useCallback((sceneLines: EncounterLine[]) => {
    setPlaying(true);
    setDone(false);
    setCurrentLine(-1);
    glow1.setValue(0);
    glow2.setValue(0);
    playLines(sceneLines, 0);
  }, [playLines, glow1, glow2]);

  // Auto-start on mount with the lines from route params.
  useEffect(() => { startScene(route.params.lines); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Replay with a chosen dynamic — re-fetches from the API.
  const replayAs = useCallback(async (dynamic?: string) => {
    if (replayLoading || playing) return;
    setReplayLoading(true);
    try {
      const data = await encounter(persona1.objectKey, persona2.objectKey, dynamic);
      if (!mounted.current) return;
      setLines(data.lines);
      setRelationship(data.relationship);
      setReplayLoading(false);
      startScene(data.lines);
    } catch {
      setReplayLoading(false);
    }
  }, [persona1.objectKey, persona2.objectKey, replayLoading, playing, startScene]);

  const uri1 = resolveMediaUrl(portraitUrl1);
  const uri2 = resolveMediaUrl(portraitUrl2);

  const glowColor1 = glow1.interpolate({ inputRange: [0, 1], outputRange: ["transparent", colors.accent] });
  const glowColor2 = glow2.interpolate({ inputRange: [0, 1], outputRange: ["transparent", colors.spirit] });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={styles.heading}>The Meeting</Text>

        {/* Side-by-side portraits */}
        <View style={styles.portraits}>
          {([
            { uri: uri1, persona: persona1, glow: glowColor1 },
            { uri: uri2, persona: persona2, glow: glowColor2 },
          ] as const).map(({ uri, persona, glow }, i) => (
            <View key={i} style={styles.portraitCol}>
              <Animated.View style={[styles.frame, { borderColor: glow }]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.portrait} resizeMode="cover" />
                ) : (
                  <View style={styles.placeholder}>
                    <Text style={styles.placeholderGlyph}>👻</Text>
                  </View>
                )}
              </Animated.View>
              <Text style={styles.personaName} numberOfLines={1}>{persona.name}</Text>
            </View>
          ))}
        </View>

        {/* Dialogue bubbles */}
        <View style={styles.dialogue}>
          {lines.map((line, i) => {
            const isLeft = line.speaker === "object1";
            const isActive = i === currentLine;
            if (i > currentLine) return null;
            return (
              <View key={i} style={[styles.bubble, isLeft ? styles.bubbleLeft : styles.bubbleRight, isActive && styles.bubbleActive]}>
                <Text style={[styles.bubbleLabel, !isLeft && styles.bubbleLabelRight]}>
                  {isLeft ? persona1.name : persona2.name}
                </Text>
                <Text style={styles.bubbleText}>{line.text}</Text>
              </View>
            );
          })}
        </View>

        {/* Verdict + replay — shown when scene finishes */}
        {done && (
          <>
            <View style={styles.verdict}>
              <Text style={styles.verdictLabel}>STATUS</Text>
              <Text style={styles.verdictText}>{relationship}</Text>
            </View>

            <Text style={styles.replayHeading}>Play it again as…</Text>
            <View style={styles.chips}>
              {REPLAY_DYNAMICS.map(({ label, value }) => (
                <Pressable
                  key={label}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  onPress={() => replayAs(value)}
                  disabled={replayLoading}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {replayLoading && (
              <View style={styles.replayLoader}>
                <ActivityIndicator color={colors.spirit} />
                <Text style={styles.replayLoaderText}>Rewriting fate…</Text>
              </View>
            )}

            <Pressable style={styles.secondary} onPress={() => navigation.popToTop()}>
              <Text style={styles.secondaryText}>Awaken something else</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: "center",
  },
  heading: {
    ...font.display,
    fontSize: 22,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  portraits: {
    flexDirection: "row",
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
  portraitCol: { alignItems: "center", gap: spacing.sm },
  frame: {
    width: PORTRAIT_SIZE,
    height: PORTRAIT_SIZE,
    borderRadius: radius.lg,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  portrait: { width: "100%", height: "100%" },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  placeholderGlyph: { fontSize: 40, opacity: 0.4 },
  personaName: {
    ...font.caption,
    color: colors.textDim,
    maxWidth: PORTRAIT_SIZE,
    textAlign: "center",
  },
  dialogue: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  bubble: {
    maxWidth: "78%",
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleLeft: { alignSelf: "flex-start" },
  bubbleRight: { alignSelf: "flex-end" },
  bubbleActive: { borderColor: colors.accent },
  bubbleLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bubbleLabelRight: { textAlign: "right" },
  bubbleText: { ...font.body, color: colors.text, lineHeight: 20 },

  verdict: {
    alignSelf: "stretch",
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.spirit,
    backgroundColor: "rgba(125,240,224,0.07)",
    alignItems: "center",
    gap: spacing.xs,
  },
  verdictLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: colors.spiritDim,
    textTransform: "uppercase",
  },
  verdictText: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.spirit,
    textAlign: "center",
    letterSpacing: 0.5,
  },

  replayHeading: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textDim,
    marginBottom: spacing.sm,
    alignSelf: "flex-start",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignSelf: "stretch",
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  chipPressed: { opacity: 0.6 },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },

  replayLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  replayLoaderText: {
    fontSize: 13,
    color: colors.spirit,
    fontStyle: "italic",
  },

  secondary: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryText: { fontSize: 14, fontWeight: "500", color: colors.textFaint },
});
