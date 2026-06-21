/**
 * Spirit Card Reveal Screen
 *
 * Reads the awakened spirit (AwakenResponse) from sessionStore — not from nav
 * params, which would mean serializing a multi-MB portrait data URL each hop.
 *
 * Shows the awakened spirit's card with an entrance animation,
 * then lets the user begin the séance or summon another object.
 */
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
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
import type { AwakenResponse } from "../src/api";
import type { Persona } from "../src/types";
import { sessionStore } from "../src/sessionStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(2);
  return `${mm}·${dd}·${yy}`;
}

// The card shows an evocative voice descriptor, not the raw Deepgram model id.
// Personas only ever use these 5 aura-2 voices (see VOICE_MODELS in claude.ts).
const VOICE_DESCRIPTORS: Record<string, string> = {
  "aura-2-thalia-en": "warm · lilting",
  "aura-2-orion-en": "deep · grave",
  "aura-2-luna-en": "bright · spry",
  "aura-2-arcas-en": "dry · easy",
  "aura-2-zeus-en": "booming · regal",
};

function voiceDescriptor(voiceModel: string): string {
  return VOICE_DESCRIPTORS[voiceModel] ?? "gravel · theatrical";
}

// ── Trait chip ────────────────────────────────────────────────────────────────

function TraitChip({ label }: { label: string }) {
  return (
    <View style={cs.chip}>
      <Text style={cs.chipText}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ── Spirit Card ───────────────────────────────────────────────────────────────

function SpiritCard({ result }: { result: AwakenResponse }) {
  const { persona, portraitUrl, encounters, returning } = result;

  // Entrance animation: translateY + scale + perspective rotateY
  const translateY = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(0.93)).current;
  const rotateY = useRef(new Animated.Value(-26)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(rotateY, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const rotateYDeg = rotateY.interpolate({
    inputRange: [-26, 0],
    outputRange: ["-26deg", "0deg"],
  });

  return (
    <Animated.View
      style={[
        cs.card,
        {
          opacity,
          transform: [
            { perspective: 900 },
            { translateY },
            { scale },
            { rotateY: rotateYDeg },
          ],
        },
      ]}
    >
      {/* Card header row */}
      <View style={cs.cardHeader}>
        <Text style={cs.archetype}>
          {persona.object ? persona.object.toUpperCase() : "SPIRIT"}
        </Text>
        <Text style={cs.catalogNum}>#{String(encounters).padStart(4, "0")}</Text>
      </View>

      {/* Portrait */}
      <View style={cs.photoWrap}>
        <Image
          source={{ uri: portraitUrl }}
          style={cs.photo}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(255,90,56,0.16)', 'transparent', 'rgba(52,183,160,0.14)']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Defs>
            <Pattern id="revealDots" x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
              <Circle cx="2.5" cy="2.5" r="1" fill="rgba(28,24,19,0.45)" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#revealDots)" opacity="0.35" />
        </Svg>
        <LinearGradient
          colors={['rgba(15,11,9,0.4)', 'transparent', 'transparent', 'rgba(15,11,9,0.35)']}
          locations={[0, 0.2, 0.8, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={cs.photoLabel}>
          <Text style={cs.photoLabelText}>★ AWAKENED · {formatDate()}</Text>
        </View>
      </View>

      {/* Name */}
      <Text style={cs.name}>{persona.name}</Text>

      {/* Tagline */}
      <Text style={cs.tagline}>"{persona.tagline}"</Text>

      {/* Trait chips */}
      {persona.traits && persona.traits.length > 0 && (
        <View style={cs.chipRow}>
          {persona.traits.map((trait, i) => (
            <TraitChip key={i} label={trait} />
          ))}
        </View>
      )}

      {/* Stats row */}
      <View style={cs.statsRow}>
        <View style={cs.statItem}>
          <Text style={cs.statLabel}>ENCOUNTERS</Text>
          <Text style={cs.statValue}>×{encounters}</Text>
        </View>
        <View style={cs.statDividerLine} />
        <View style={cs.statItem}>
          <Text style={cs.statLabel}>VOICE</Text>
          <Text style={cs.statValueMono}>
            {voiceDescriptor(persona.voiceModel)}
          </Text>
        </View>
      </View>

      {/* Backstory quote */}
      <Text style={cs.backstory}>"{persona.backstory}"</Text>

      {/* REMEMBERS YOU ribbon */}
      {returning && (
        <View style={cs.ribbonWrap} pointerEvents="none">
          <View style={cs.ribbon}>
            <Text style={cs.ribbonText}>REMEMBERS YOU</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// ── Persona picker chip ───────────────────────────────────────────────────────

function AltPersonaChip({
  persona,
  onPress,
  speaking,
}: {
  persona: Persona;
  onPress: () => Promise<void>;
  speaking: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [pk.chip, speaking && pk.chipActive, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      {speaking && <View style={pk.speakingDot} />}
      <Text style={[pk.chipName, speaking && pk.chipNameActive]} numberOfLines={1}>
        {persona.name}
      </Text>
      <Text style={pk.chipArchetype}>{persona.archetype.replace(/_/g, " ")}</Text>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RevealScreen() {
  const result = sessionStore.getResult();
  const challengerResult = sessionStore.getChallenger();

  // Index into result.personas for whichever spirit is currently showing.
  const [activePersonaIdx, setActivePersonaIdx] = useState(0);
  // Fades the picker in after the opening line finishes playing.
  const pickerOpacity = useRef(new Animated.Value(0)).current;
  const [pickerVisible, setPickerVisible] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const mounted = useRef(true);
  useEffect(() => { return () => { mounted.current = false; soundRef.current?.unloadAsync().catch(() => {}); }; }, []);

  const navLock = useRef(false);
  useFocusEffect(useCallback(() => { navLock.current = false; }, []));

  const [meetingLoading, setMeetingLoading] = useState(!!challengerResult);

  // Auto-TTS the active persona's opening line.
  const speakOpening = useCallback(async (persona: Persona, idx: number) => {
    if (!mounted.current) return;
    setSpeakingIdx(idx);
    try {
      soundRef.current?.stopAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;

      const { tts } = await import("../src/api");
      const audio = await tts(persona.openingLine, persona.voiceModel);
      if (!mounted.current) return;

      if (audio) {
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
      } else {
        await new Promise((r) => setTimeout(r, Math.max(2000, persona.openingLine.length * 50)));
      }
    } catch {
      // TTS failure is silent — the text is still visible on the card
    }
    if (!mounted.current) return;
    setSpeakingIdx(null);
    // Reveal picker after the first opening line finishes
    setPickerVisible(true);
    Animated.timing(pickerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [pickerOpacity]);

  // Play opening line on mount (skip if in introduce mode — we navigate away immediately)
  useEffect(() => {
    if (challengerResult || !result) return;
    const persona = result.personas?.[0] ?? result.persona;
    void speakOpening(persona, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Encounter auto-navigation when in introduce mode.
  useEffect(() => {
    if (!challengerResult || !result) return;
    let cancelled = false;
    (async () => {
      try {
        const { encounter } = await import("../src/api");
        const data = await encounter(challengerResult.persona.objectKey, result.persona.objectKey);
        if (cancelled) return;
        router.replace({ pathname: "/encounter", params: { encounterJson: JSON.stringify(data) } });
      } catch {
        // If encounter fails, show the card normally so user can still séance
        if (!cancelled) setMeetingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!result) {
    return (
      <SafeAreaView style={ss.safe}>
        <LinearGradient
          colors={['#241C16', '#0e0a08']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={ss.center}>
          <Text style={ss.errorText}>The spirit faded before it could appear.</Text>
          <Pressable
            style={({ pressed }) => [ss.seanceBtn, ss.recoverBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.replace("/")}
          >
            <Text style={ss.seanceBtnText}>Summon another →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const allPersonas = result.personas?.length ? result.personas : [result.persona];
  const activePersona = allPersonas[activePersonaIdx] ?? result.persona;
  // Show the card with whichever persona is active (swap the name/tagline/traits
  // while keeping the portrait and encounter count from the original result).
  const displayResult: AwakenResponse = { ...result, persona: activePersona };

  const handlePickPersona = async (idx: number) => {
    if (idx === activePersonaIdx || speakingIdx !== null) return;
    setActivePersonaIdx(idx);
    const persona = allPersonas[idx];
    // Persist the selection so conversation uses the right persona
    const { selectPersona } = await import("../src/api");
    selectPersona(persona.objectKey, persona).catch(() => {});
    // Update the sessionStore result so conversation reads the right persona
    sessionStore.setResult({ ...result, persona });
    void speakOpening(persona, idx);
  };

  const handleSeance = () => {
    if (navLock.current) return;
    navLock.current = true;
    // Make sure the store has the currently-selected persona before navigating
    sessionStore.setResult({ ...result, persona: activePersona });
    router.push("/conversation");
  };

  const handleIntroduce = () => {
    sessionStore.setChallenger({ ...result, persona: activePersona });
    router.push("/");
  };

  const handleSummonAnother = () => {
    router.replace("/");
  };

  const altPersonas = allPersonas.filter((_, i) => i !== activePersonaIdx);

  return (
    <SafeAreaView style={ss.safe} edges={["top", "bottom"]}>
      <LinearGradient
        colors={['#241C16', '#0e0a08']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Image
        source={require('../assets/grain.png')}
        style={[StyleSheet.absoluteFillObject, { opacity: 0.3 }]}
        resizeMode="repeat"
      />
      <ScrollView
        contentContainerStyle={ss.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Top label — shows "speaking" state */}
        <Text style={ss.topLabel}>
          {speakingIdx !== null ? "✦ the spirit speaks ✦" : "✦ the spirit has taken form ✦"}
        </Text>

        {/* Spirit card �� swaps persona on pick */}
        <SpiritCard result={displayResult} />

        {/* Persona picker — fades in after opening line finishes */}
        {pickerVisible && altPersonas.length > 0 && (
          <Animated.View style={[pk.wrap, { opacity: pickerOpacity }]}>
            <Text style={pk.label}>choose a different spirit</Text>
            <View style={pk.row}>
              {allPersonas.map((p, i) => {
                if (i === activePersonaIdx) return null;
                const originalIdx = allPersonas.indexOf(p);
                return (
                  <AltPersonaChip
                    key={p.name}
                    persona={p}
                    onPress={() => handlePickPersona(originalIdx)}
                    speaking={speakingIdx === originalIdx}
                  />
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Primary CTA */}
        <Pressable
          style={({ pressed }) => [ss.seanceBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSeance}
        >
          <Text style={ss.seanceBtnText}>Hold a séance →</Text>
        </Pressable>

        {/* Introduce to another */}
        <Pressable
          style={({ pressed }) => [ss.introduceBtn, pressed && { opacity: 0.85 }]}
          onPress={handleIntroduce}
        >
          <Text style={ss.introduceBtnText}>✦ introduce it to another</Text>
        </Pressable>

        {/* Summon another link */}
        <Pressable onPress={handleSummonAnother} style={ss.anotherWrap}>
          <Text style={ss.anotherText}>summon another object</Text>
        </Pressable>
      </ScrollView>

      {/* Overlay while the encounter API call is in flight */}
      {meetingLoading && (
        <View style={ss.meetingOverlay}>
          <ActivityIndicator color="#34B7A0" size="large" />
          <Text style={ss.meetingOverlayText}>arranging the meeting…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Picker styles ─────────────────────────────────────────────────────────────

const pk = StyleSheet.create({
  wrap: {
    width: 298,
    marginBottom: 20,
    alignItems: "center",
  },
  label: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9,
    color: "#8a7c68",
    letterSpacing: 2,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  chip: {
    flex: 1,
    backgroundColor: "rgba(242,233,214,0.06)",
    borderWidth: 0.75,
    borderColor: "#4A3F33",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  chipActive: {
    borderColor: "#D6A94B",
    backgroundColor: "rgba(214,169,75,0.1)",
  },
  speakingDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D6A94B",
  },
  chipName: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 14,
    color: "#B8A98C",
    textAlign: "center",
  },
  chipNameActive: {
    color: "#F2E9D6",
  },
  chipArchetype: {
    fontFamily: "DMMono_400Regular",
    fontSize: 8,
    color: "#5A4F42",
    letterSpacing: 1,
    textAlign: "center",
  },
});

// ── Card styles ───────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  card: {
    width: 298,
    backgroundColor: "#F2E9D6",
    borderRadius: 15,
    overflow: "hidden",
    alignSelf: "center",
    marginBottom: 20,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 20,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  archetype: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9,
    color: "#7A1F0C",
    letterSpacing: 1.5,
  },
  catalogNum: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9,
    color: "#9b8e76",
  },
  photoWrap: {
    marginHorizontal: 14,
    height: 184,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#D6CDB8",
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoLabel: {
    position: "absolute",
    bottom: 8,
    left: 8,
  },
  photoLabelText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 8,
    color: "#F2E9D6",
    letterSpacing: 0.5,
  },
  name: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 36,
    color: "#1C1813",
    marginTop: 12,
    marginHorizontal: 14,
    lineHeight: 40,
  },
  tagline: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 15,
    fontStyle: "italic",
    color: "#7c7060",
    marginHorizontal: 14,
    marginTop: 4,
    lineHeight: 22,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginHorizontal: 14,
    marginTop: 12,
  },
  chip: {
    backgroundColor: "rgba(201,154,59,0.12)",
    borderWidth: 0.75,
    borderColor: "#C99A3B",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chipText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 8.5,
    color: "#7A1F0C",
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginTop: 14,
    paddingVertical: 10,
    borderTopWidth: 0.75,
    borderBottomWidth: 0.75,
    borderStyle: "dashed",
    borderColor: "#C9BCA2",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statLabel: {
    fontFamily: "DMMono_400Regular",
    fontSize: 8,
    color: "#9b8e76",
    letterSpacing: 1,
  },
  statValue: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 20,
    color: "#1C1813",
  },
  statValueMono: {
    fontFamily: "DMMono_400Regular",
    fontSize: 11,
    color: "#1C1813",
    lineHeight: 17,
    marginTop: 3,
  },
  statDividerLine: {
    width: 1,
    height: 28,
    backgroundColor: '#C9BCA2',
    marginHorizontal: 8,
  },
  backstory: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 15,
    fontStyle: "italic",
    color: "#3B342A",
    marginHorizontal: 14,
    marginTop: 14,
    lineHeight: 22,
  },
  // Ribbon for returning spirits
  ribbonWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 80,
    height: 80,
    overflow: "hidden",
  },
  ribbon: {
    position: "absolute",
    top: 16,
    right: -22,
    width: 90,
    backgroundColor: "#D93D1A",
    paddingVertical: 4,
    paddingHorizontal: 38,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
  },
  ribbonText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 7.5,
    color: "#F6EFE0",
    letterSpacing: 1.5,
  },
});

// ── Screen styles ─────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    paddingTop: 28,
    paddingBottom: 40,
    alignItems: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorText: {
    color: "#D93D1A",
    fontSize: 15,
    textAlign: "center",
  },
  topLabel: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9,
    letterSpacing: 3,
    color: "#D6A94B",
    textAlign: "center",
    marginBottom: 20,
  },
  seanceBtn: {
    width: 298,
    backgroundColor: "#D93D1A",
    borderWidth: 1,
    borderColor: "#7A1F0C",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  seanceBtnText: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 22,
    color: "#F0E7D6",
  },
  introduceBtn: {
    width: 298,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#34B7A0",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  introduceBtnText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 12,
    color: "#34B7A0",
    letterSpacing: 1.5,
  },
  recoverBtn: {
    width: 240,
    marginTop: 20,
  },
  anotherWrap: {
    paddingVertical: 8,
  },
  anotherText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 9.5,
    color: "#8a7c68",
    textDecorationLine: "underline",
    letterSpacing: 1,
  },
  meetingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(14,10,8,0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  meetingOverlayText: {
    fontFamily: "DMMono_400Regular",
    fontSize: 11,
    color: "#34B7A0",
    letterSpacing: 2,
    fontStyle: "italic",
  },
});
