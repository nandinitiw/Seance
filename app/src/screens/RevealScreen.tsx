import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Audio } from "expo-av";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { resolveMediaUrl } from "../config";
import { colors, spacing, radius, font } from "../theme";
import { converse, encounter } from "../api/client";

// REVEAL — the payoff. The portrait fades + scales in like it's being conjured,
// then the character speaks its opening line unprompted.
type Props = NativeStackScreenProps<RootStackParamList, "Reveal">;

export default function RevealScreen({ route, navigation }: Props) {
  const { result, challengerKey } = route.params;
  const { persona } = result;
  const traits = persona.traits ?? [];
  const [encountering, setEncountering] = useState(false);

  // Conjuring animation: fade + scale the whole portrait frame in on mount.
  const appear = useRef(new Animated.Value(0)).current;
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  // Speak the opening line the moment the character appears.
  useEffect(() => {
    let cancelled = false;
    async function speakOpeningLine() {
      if (!persona.openingLine) return;
      try {
        const data = await converse({
          objectKey: persona.objectKey,
          text: persona.openingLine,
        });
        if (cancelled || !data.audio) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${data.audio}` },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) sound.unloadAsync().catch(() => {});
        });
      } catch {
        // No Deepgram key or network error — opening line stays as text only, no crash.
      }
    }
    speakOpeningLine();
    return () => {
      cancelled = true;
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, [persona.objectKey, persona.openingLine]);

  // If this object was awakened as the challenger, immediately trigger the encounter.
  const triggerEncounter = useCallback(async (challengerObjectKey: string) => {
    setEncountering(true);
    try {
      // challengerKey is object1, current object is object2.
      const data = await encounter(challengerObjectKey, persona.objectKey);
      navigation.replace("Encounter", {
        lines: data.lines,
        relationship: data.relationship,
        persona1: data.persona1,
        persona2: data.persona2,
        portraitUrl1: data.portraitUrl1,
        portraitUrl2: data.portraitUrl2,
      });
    } catch {
      setEncountering(false);
    }
  }, [persona.objectKey, navigation]);

  useEffect(() => {
    if (challengerKey) triggerEncounter(challengerKey);
  }, [challengerKey, triggerEncounter]);

  const portraitUri = resolveMediaUrl(result.portraitUrl);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* The conjured portrait */}
        <Animated.View
          style={[
            styles.frame,
            {
              opacity: appear,
              transform: [
                {
                  scale: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.88, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Faint placeholder shown until the image loads (or if it fails). */}
          {(!imageLoaded || imageFailed) && (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderGlyph}>👻</Text>
            </View>
          )}
          {!imageFailed && !!portraitUri && (
            <Image
              source={{ uri: portraitUri }}
              style={styles.portrait}
              resizeMode="cover"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          )}
        </Animated.View>

        {/* Name + tagline */}
        <Text style={styles.name}>{persona.name}</Text>
        {!!persona.tagline && <Text style={styles.tagline}>{persona.tagline}</Text>}

        {/* Trait chips */}
        {traits.length > 0 && (
          <View style={styles.chips}>
            {traits.map((trait, i) => (
              <View key={`${trait}-${i}`} style={styles.chip}>
                <Text style={styles.chipText}>{trait}</Text>
              </View>
            ))}
          </View>
        )}

        {/* "It remembers you" — only when Redis already knew this object. */}
        {result.returning && (
          <View style={styles.memory}>
            <Text style={styles.memoryText}>
              ✨ It remembers you — encounter #{result.encounters}.
            </Text>
          </View>
        )}

        {/* The character's first words — also spoken aloud on mount. */}
        {!!(persona.openingLine ?? persona.backstory) && (
          <View style={styles.quote}>
            <View style={styles.quoteBar} />
            <Text style={styles.quoteText}>{persona.openingLine ?? persona.backstory}</Text>
          </View>
        )}

        {/* Actions */}
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          onPress={() => navigation.navigate("Conversation", { result })}
        >
          <Text style={styles.primaryText}>Talk to it</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.rival, pressed && styles.rivalPressed]}
          onPress={() => navigation.navigate("Capture", { challengerKey: persona.objectKey } as any)}
          disabled={encountering}
        >
          <Text style={styles.rivalText}>
            {encountering ? "Summoning the encounter…" : "✨  Introduce it to another"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondary}
          onPress={() => navigation.popToTop()}
        >
          <Text style={styles.secondaryText}>Awaken something else</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const PORTRAIT_SIZE = 280;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: "center",
  },

  // Portrait frame — amber glow so it feels summoned out of the dark.
  frame: {
    width: PORTRAIT_SIZE,
    height: PORTRAIT_SIZE,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.bgElevated,
    overflow: "hidden",
    marginBottom: spacing.lg,
    // Conjured glow.
    shadowColor: colors.accent,
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  portrait: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  placeholderGlyph: {
    fontSize: 64,
    opacity: 0.4,
  },

  name: {
    ...font.display,
    textAlign: "center",
  },
  tagline: {
    ...font.caption,
    color: colors.textDim,
    textAlign: "center",
    marginTop: spacing.xs,
    fontStyle: "italic",
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textDim,
  },

  memory: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(125, 240, 224, 0.10)",
    borderWidth: 1,
    borderColor: colors.spiritDim,
  },
  memoryText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.spirit,
    textAlign: "center",
  },

  // Spoken opening line — left accent bar, italic, like it's introducing itself.
  quote: {
    flexDirection: "row",
    alignSelf: "stretch",
    marginTop: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  quoteBar: {
    width: 3,
    backgroundColor: colors.accent,
  },
  quoteText: {
    flex: 1,
    ...font.body,
    color: colors.text,
    fontStyle: "italic",
    lineHeight: 24,
    padding: spacing.md,
  },

  primary: {
    alignSelf: "stretch",
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  primaryPressed: {
    backgroundColor: colors.accentSoft,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.bg,
  },

  rival: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: "center",
  },
  rivalPressed: { opacity: 0.6 },
  rivalText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.accent,
  },
  secondary: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textFaint,
  },
});
