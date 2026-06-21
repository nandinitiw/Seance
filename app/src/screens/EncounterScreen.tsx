import { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { converse } from "../api/client";
import { resolveMediaUrl } from "../config";
import { colors, font, radius, spacing } from "../theme";

// ENCOUNTER — two awakened objects meet for the first time. Their 6-line
// scripted scene plays out with alternating portraits + TTS voices.

type Props = NativeStackScreenProps<RootStackParamList, "Encounter">;

const PORTRAIT_SIZE = 130;

export default function EncounterScreen({ route, navigation }: Props) {
  const { lines, persona1, persona2, portraitUrl1, portraitUrl2 } = route.params;

  const [currentLine, setCurrentLine] = useState(-1); // -1 = not started
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const mounted = useRef(true);

  // Glow animation pulses on the active portrait.
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

  const playLine = useCallback(async (index: number) => {
    if (!mounted.current) return;
    const line = lines[index];
    if (!line) { setDone(true); setPlaying(false); return; }

    setCurrentLine(index);
    activateGlow(line.speaker);

    const persona = line.speaker === "object1" ? persona1 : persona2;

    try {
      // Use /api/converse to get TTS for this line.
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
        // No TTS — brief pause so text is readable before advancing.
        await new Promise((r) => setTimeout(r, 2200));
      }
    } catch {
      await new Promise((r) => setTimeout(r, 2200));
    }

    if (mounted.current) playLine(index + 1);
  }, [lines, persona1, persona2, activateGlow]);

  const startScene = useCallback(() => {
    setPlaying(true);
    setDone(false);
    setCurrentLine(-1);
    glow1.setValue(0);
    glow2.setValue(0);
    playLine(0);
  }, [playLine, glow1, glow2]);

  const uri1 = resolveMediaUrl(portraitUrl1);
  const uri2 = resolveMediaUrl(portraitUrl2);

  const glowColor1 = glow1.interpolate({ inputRange: [0, 1], outputRange: ["transparent", colors.accent] });
  const glowColor2 = glow2.interpolate({ inputRange: [0, 1], outputRange: ["transparent", colors.spirit ?? colors.accent] });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={styles.heading}>Their Encounter</Text>

        {/* Side-by-side portraits */}
        <View style={styles.portraits}>
          {[
            { uri: uri1, persona: persona1, glow: glowColor1 },
            { uri: uri2, persona: persona2, glow: glowColor2 },
          ].map(({ uri, persona, glow }, i) => (
            <View key={i} style={styles.portraitCol}>
              <Animated.View style={[styles.frame, { borderColor: glow }]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.portrait} resizeMode="cover" />
                ) : (
                  <View style={styles.placeholder}><Text style={styles.placeholderGlyph}>👻</Text></View>
                )}
              </Animated.View>
              <Text style={styles.personaName} numberOfLines={1}>{persona.name}</Text>
            </View>
          ))}
        </View>

        {/* Dialogue lines */}
        <View style={styles.dialogue}>
          {lines.map((line, i) => {
            const isLeft = line.speaker === "object1";
            const isActive = i === currentLine;
            const isRevealed = i <= currentLine;
            if (!isRevealed) return null;
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

        {/* Actions */}
        {!playing && !done && (
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            onPress={startScene}
          >
            <Text style={styles.primaryText}>▶  Begin the encounter</Text>
          </Pressable>
        )}

        {done && (
          <>
            <Pressable
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              onPress={startScene}
            >
              <Text style={styles.primaryText}>↺  Play again</Text>
            </Pressable>
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
  primary: {
    alignSelf: "stretch",
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  primaryPressed: { backgroundColor: colors.accentSoft },
  primaryText: { fontSize: 17, fontWeight: "700", color: colors.bg },
  secondary: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryText: { fontSize: 14, fontWeight: "500", color: colors.textFaint },
});
