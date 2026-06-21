/**
 * Encounter Screen — Séance
 * Two awakened spirits meet. A 6-line scripted scene plays with their voices.
 * After the scene: a relationship verdict + replay chips to try other dynamics.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
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
import Svg, { Defs, Pattern, Circle, Rect } from "react-native-svg";
import { Audio } from "expo-av";
import { encounter, tts, type EncounterLine, type EncounterResponse } from "../src/api";
import { C, FONTS, SP } from "../src/theme";

// ── Constants ─────────────────────────────────────────────────────────────────

const REPLAY_DYNAMICS = [
  { label: "FATE DECIDES",  value: undefined },
  { label: "RIVALS",        value: "rivals" },
  { label: "STAR-CROSSED",  value: "unexpected attraction and flirtation" },
  { label: "BEST FRIENDS",  value: "instant best friends who have found their soulmate" },
  { label: "AWKWARD",       value: "one-sided obsession while the other is totally indifferent" },
  { label: "MENTOR",        value: "mentor and student, where one immediately tries to dominate" },
];

// ── Halftone overlay ──────────────────────────────────────────────────────────

function HalftoneOverlay() {
  return (
    <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Defs>
        <Pattern id="encounterDots" x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
          <Circle cx="2.5" cy="2.5" r="1" fill="rgba(28,24,19,0.45)" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#encounterDots)" opacity="0.3" />
    </Svg>
  );
}

// ── Portrait card ─────────────────────────────────────────────────────────────

function PortraitCard({
  name,
  portraitUrl,
  active,
  align,
}: {
  name: string;
  portraitUrl: string;
  active: boolean;
  align: "left" | "right";
}) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(glow, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [active, glow]);

  const activeColor = align === "left" ? "#D93D1A" : "#34B7A0";

  const borderColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(184,146,60,0.25)", activeColor],
  });

  const shadowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.7] });

  return (
    <View style={styles.portraitCol}>
      <Animated.View style={[styles.portraitFrame, { borderColor, shadowOpacity, shadowColor: activeColor }]}>
        {portraitUrl ? (
          <Image source={{ uri: portraitUrl }} style={styles.portraitImg} resizeMode="cover" />
        ) : (
          <View style={styles.portraitPlaceholder} />
        )}
        <LinearGradient
          colors={["rgba(255,90,56,0.12)", "transparent", "rgba(52,183,160,0.10)"]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <HalftoneOverlay />
      </Animated.View>
      <Text style={styles.portraitName} numberOfLines={1}>{name}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EncounterScreen() {
  const { encounterJson } = useLocalSearchParams<{ encounterJson: string }>();

  let initial: EncounterResponse | null = null;
  try { initial = JSON.parse(encounterJson ?? "null"); } catch { /* handled */ }

  const [lines, setLines] = useState<EncounterLine[]>(initial?.lines ?? []);
  const [relationship, setRelationship] = useState(initial?.relationship ?? "");
  const [currentLine, setCurrentLine] = useState(-1);
  const [done, setDone] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const replayLoadingRef = useRef(false);
  const mounted = useRef(true);
  const soundRef = useRef<Audio.Sound | null>(null);
  const sceneIdRef = useRef(0);

  const persona1 = initial?.persona1;
  const persona2 = initial?.persona2;
  const portraitUrl1 = initial?.portraitUrl1 ?? "";
  const portraitUrl2 = initial?.portraitUrl2 ?? "";

  useEffect(() => {
    mounted.current = true;
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
    return () => {
      mounted.current = false;
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const playLines = useCallback(async (sceneLines: EncounterLine[], index: number, sceneId: number) => {
    if (!mounted.current || sceneId !== sceneIdRef.current) return;
    const line = sceneLines[index];
    if (!line) { setDone(true); return; }

    setCurrentLine(index);

    const voiceModel = line.speaker === "object1"
      ? persona1?.voiceModel
      : persona2?.voiceModel;

    const audio = voiceModel ? await tts(line.text, voiceModel) : null;

    if (!mounted.current || sceneId !== sceneIdRef.current) return;

    if (audio) {
      try {
        if (soundRef.current) {
          await soundRef.current.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${audio}` },
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
      } catch {
        await new Promise((r) => setTimeout(r, Math.max(2200, line.text.length * 55)));
      }
    } else {
      await new Promise((r) => setTimeout(r, Math.max(2200, line.text.length * 55)));
    }

    if (mounted.current && sceneId === sceneIdRef.current) playLines(sceneLines, index + 1, sceneId);
  }, [persona1, persona2]);

  const startScene = useCallback((sceneLines: EncounterLine[]) => {
    // Bump scene ID to invalidate any in-flight TTS/audio from the previous scene.
    sceneIdRef.current += 1;
    const id = sceneIdRef.current;
    soundRef.current?.stopAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    setDone(false);
    setCurrentLine(-1);
    playLines(sceneLines, 0, id);
  }, [playLines]);

  // Auto-start on mount.
  useEffect(() => {
    if (lines.length > 0) startScene(lines);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const replayAs = useCallback(async (dynamic?: string) => {
    if (replayLoadingRef.current || !persona1 || !persona2) return;
    replayLoadingRef.current = true;
    setReplayLoading(true);
    try {
      const data = await encounter(persona1.objectKey, persona2.objectKey, dynamic);
      if (!mounted.current) return;
      setLines(data.lines);
      setRelationship(data.relationship);
      replayLoadingRef.current = false;
      setReplayLoading(false);
      startScene(data.lines);
    } catch {
      replayLoadingRef.current = false;
      setReplayLoading(false);
    }
  }, [persona1, persona2, startScene]);

  if (!initial || !persona1 || !persona2) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>The spirits could not meet.</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient
        colors={["#241C16", "#0e0a08"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Image
        source={require("../assets/grain.png")}
        style={[StyleSheet.absoluteFillObject, { opacity: 0.3 }]}
        resizeMode="repeat"
      />

      {/* Header row — always visible so user can leave during scene */}
      <View style={styles.headerRow}>
        <Text style={styles.topLabel}>✦ the meeting ✦</Text>
        <Pressable
          style={({ pressed }) => [styles.leaveBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.leaveBtnText}>LEAVE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.portraits}>
          <PortraitCard
            name={persona1.name}
            portraitUrl={portraitUrl1}
            active={lines[currentLine]?.speaker === "object1"}
            align="left"
          />
          <View style={styles.vsWrap}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <PortraitCard
            name={persona2.name}
            portraitUrl={portraitUrl2}
            active={lines[currentLine]?.speaker === "object2"}
            align="right"
          />
        </View>

        {/* Dialogue */}
        <View style={styles.dialogue}>
          {lines.map((line, i) => {
            if (i > currentLine) return null;
            const isLeft = line.speaker === "object1";
            const isActive = i === currentLine;
            return (
              <View
                key={i}
                style={[
                  styles.bubble,
                  isLeft ? styles.bubbleLeft : styles.bubbleRight,
                  isActive && (isLeft ? styles.bubbleActiveLeft : styles.bubbleActiveRight),
                ]}
              >
                <Text style={[styles.bubbleSpeaker, !isLeft && styles.bubbleSpeakerRight]}>
                  {(isLeft ? persona1.name : persona2.name).toUpperCase()}
                </Text>
                <Text style={styles.bubbleText}>{line.text}</Text>
              </View>
            );
          })}
        </View>

        {/* Verdict + replay chips */}
        {done && (
          <>
            {/* Verdict card */}
            <View style={styles.verdict}>
              <Text style={styles.verdictLabel}>RELATIONSHIP STATUS</Text>
              <View style={styles.verdictDivider} />
              <Text style={styles.verdictText}>{relationship}</Text>
            </View>

            {/* Replay section */}
            {replayLoading ? (
              <View style={styles.replayLoader}>
                <ActivityIndicator color="#34B7A0" size="small" />
                <Text style={styles.replayLoaderText}>rewriting fate…</Text>
              </View>
            ) : (
              <>
                <Text style={styles.replayLabel}>PLAY IT AGAIN AS…</Text>
                <View style={styles.chips}>
                  {REPLAY_DYNAMICS.map(({ label, value }) => (
                    <Pressable
                      key={label}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                      onPress={() => replayAs(value)}
                    >
                      <Text style={styles.chipText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* Back */}
            <Pressable onPress={() => router.back()} style={styles.backWrap}>
              <Text style={styles.backText}>return to the spirits</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP.lg,
    paddingTop: SP.lg,
    paddingBottom: SP.sm,
    position: "relative",
  },
  topLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 3,
    color: "#D6A94B",
    textAlign: "center",
  },
  leaveBtn: {
    position: "absolute",
    right: SP.lg,
    borderWidth: 1,
    borderColor: "#3A3128",
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  leaveBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: "#A89A86",
    letterSpacing: 1,
  },
  scroll: {
    paddingTop: SP.md,
    paddingBottom: 48,
    paddingHorizontal: SP.lg,
    alignItems: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SP.md,
    padding: SP.xl,
  },
  errorText: {
    fontFamily: FONTS.mono,
    fontSize: 13,
    color: "#D93D1A",
    textAlign: "center",
  },
  backBtn: { paddingVertical: 8 },
  backBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: C.textDim,
    textDecorationLine: "underline",
    letterSpacing: 1,
  },

  // Portraits row
  portraits: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 0,
    marginBottom: SP.lg,
    width: "100%",
  },
  portraitCol: {
    alignItems: "center",
    flex: 1,
    gap: SP.sm,
  },
  portraitFrame: {
    width: 120,
    height: 148,
    borderRadius: 9,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: "#1A120D",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    elevation: 6,
  },
  portraitImg: { width: "100%", height: "100%" },
  portraitPlaceholder: { flex: 1, backgroundColor: "#1A120D" },
  portraitName: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    color: C.textDim,
    letterSpacing: 1,
    textAlign: "center",
    maxWidth: 120,
  },
  vsWrap: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 52,
  },
  vsText: {
    fontFamily: FONTS.serif,
    fontSize: 18,
    color: C.textMuted,
    opacity: 0.6,
  },

  // Dialogue
  dialogue: {
    alignSelf: "stretch",
    gap: SP.sm,
    marginBottom: SP.xl,
  },
  bubble: {
    maxWidth: "75%",
    backgroundColor: "#F2E9D6",
    borderRadius: 8,
    padding: SP.md,
    borderWidth: 0.75,
    borderColor: "#C9BCA2",
  },
  bubbleLeft: { alignSelf: "flex-start" },
  bubbleRight: { alignSelf: "flex-end" },
  bubbleActiveLeft: {
    borderColor: "#D93D1A",
    shadowColor: "#D93D1A",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  bubbleActiveRight: {
    borderColor: "#34B7A0",
    shadowColor: "#34B7A0",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  bubbleSpeaker: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    color: "#7A1F0C",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  bubbleSpeakerRight: {
    textAlign: "right",
    color: "#0F6B5C",
  },
  bubbleText: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: "#1C1813",
    lineHeight: 22,
  },

  // Verdict
  verdict: {
    alignSelf: "stretch",
    backgroundColor: "#F2E9D6",
    borderRadius: 10,
    borderWidth: 0.75,
    borderColor: "#C9BCA2",
    padding: SP.lg,
    alignItems: "center",
    marginBottom: SP.lg,
    gap: SP.sm,
  },
  verdictLabel: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 2.5,
    color: "#9b8e76",
  },
  verdictDivider: {
    width: 40,
    height: 0.75,
    backgroundColor: "#C9A43B",
    marginVertical: 2,
  },
  verdictText: {
    fontFamily: FONTS.serif,
    fontSize: 32,
    color: "#1C1813",
    textAlign: "center",
  },

  // Replay
  replayLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    marginBottom: SP.lg,
  },
  replayLoaderText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: "#34B7A0",
    letterSpacing: 1,
    fontStyle: "italic",
  },
  replayLabel: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.textDim,
    marginBottom: SP.sm,
    alignSelf: "stretch",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
    alignSelf: "stretch",
    marginBottom: SP.lg,
  },
  chip: {
    paddingHorizontal: SP.md,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 0.75,
    borderColor: "#B8923C",
    backgroundColor: "rgba(201,154,59,0.08)",
  },
  chipPressed: { opacity: 0.6 },
  chipText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: "#7A1F0C",
  },

  backWrap: { paddingVertical: 8 },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: "#8a7c68",
    textDecorationLine: "underline",
    letterSpacing: 1,
  },
});
