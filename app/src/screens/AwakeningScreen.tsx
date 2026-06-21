import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { awaken } from "../api/client";
import { colors, font, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Awakening">;

// A séance shouldn't feel like an HTTP request — hold the veil shut this long
// even if the (mock) server answers in a blink.
const MIN_AWAKENING_MS = 2800;

// What the medium mutters while reaching across. Crossfaded one to the next.
const INCANTATIONS = [
  "Reaching across the veil…",
  "Stirring something ancient…",
  "It's listening back…",
  "Giving it a voice…",
];
const LINE_INTERVAL_MS = 1400;

export default function AwakeningScreen({ navigation, route }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [lineIndex, setLineIndex] = useState(0);

  // --- séance scene animation values ---
  const breathe = useRef(new Animated.Value(0)).current; // orb scale + glow pulse
  const spin = useRef(new Animated.Value(0)).current; // slow ring rotation
  const lineFade = useRef(new Animated.Value(1)).current; // incantation crossfade

  // Kick off the channeling + the minimum-time gate. One effect owns the whole
  // lifecycle so cleanup can cancel everything in one place.
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    // The actual summoning, padded to never resolve before MIN_AWAKENING_MS.
    (async () => {
      try {
        const result = await awaken(route.params.imageDataUrl);
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, MIN_AWAKENING_MS - elapsed);
        await new Promise<void>((r) => setTimeout(r, remaining));
        if (cancelled) return;
        // replace (not navigate) so back never lands on the loader again.
        navigation.replace("Reveal", {
          result,
          imageDataUrl: route.params.imageDataUrl,
          ...(route.params.challengerKey ? { challengerKey: route.params.challengerKey } : {}),
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
    // route.params/navigation are stable for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the looping animations. Stop them the moment something breaks.
  useEffect(() => {
    if (error) {
      breathe.stopAnimation();
      spin.stopAnimation();
      return;
    }

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    breatheLoop.start();
    spinLoop.start();

    return () => {
      breatheLoop.stop();
      spinLoop.stop();
    };
  }, [error, breathe, spin]);

  // Cycle the incantations with a quick crossfade between each.
  useEffect(() => {
    if (error) return;
    const id = setInterval(() => {
      Animated.timing(lineFade, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setLineIndex((i) => (i + 1) % INCANTATIONS.length);
        Animated.timing(lineFade, {
          toValue: 1,
          duration: 350,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    }, LINE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [error, lineFade]);

  // --- error state: nothing answered ---
  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.deadGlyph}>✕</Text>
          <Text style={styles.errorTitle}>The connection broke.</Text>
          <Text style={styles.errorSub}>Nothing answered.</Text>
          <Pressable
            onPress={() => navigation.replace("Capture")}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
          {/* Dim debug breadcrumb — not for the séance, for us. */}
          <Text style={styles.errorDetail} numberOfLines={3}>
            {error}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- the channeling scene ---
  const orbScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.12] });
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] });
  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <View style={styles.scene}>
          {/* Outermost cyan breath — the spirit pressing against the glass. */}
          <Animated.View
            style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
          />
          {/* Slow-turning amber ring — the medium's circle. */}
          <Animated.View style={[styles.ring, { transform: [{ rotate }] }]}>
            <View style={[styles.tick, styles.tickTop]} />
            <View style={[styles.tick, styles.tickBottom]} />
            <View style={[styles.tick, styles.tickLeft]} />
            <View style={[styles.tick, styles.tickRight]} />
          </Animated.View>
          {/* The breathing orb itself, amber core under a cyan veil. */}
          <Animated.View style={[styles.orbGlow, { transform: [{ scale: orbScale }] }]} />
          <Animated.View style={[styles.orb, { transform: [{ scale: orbScale }] }]} />
        </View>

        <Animated.Text style={[styles.incantation, { opacity: lineFade }]}>
          {INCANTATIONS[lineIndex]}
        </Animated.Text>
        <Text style={styles.subtle}>waking up</Text>
      </View>
    </SafeAreaView>
  );
}

const ORB = 96;
const RING = 200;
const HALO = 260;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },

  // The animated stack — everything centered on the same point.
  scene: {
    width: HALO,
    height: HALO,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  halo: {
    position: "absolute",
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: colors.spirit,
  },
  ring: {
    position: "absolute",
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1,
    borderColor: colors.accent,
    opacity: 0.55,
  },
  // Four amber pips riding the medium's circle so the rotation reads.
  tick: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentSoft,
  },
  tickTop: { top: -3, left: RING / 2 - 3 },
  tickBottom: { bottom: -3, left: RING / 2 - 3 },
  tickLeft: { left: -3, top: RING / 2 - 3 },
  tickRight: { right: -3, top: RING / 2 - 3 },

  orbGlow: {
    position: "absolute",
    width: ORB + 36,
    height: ORB + 36,
    borderRadius: (ORB + 36) / 2,
    backgroundColor: colors.spiritDim,
    opacity: 0.45,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.spirit,
  },

  incantation: {
    ...font.title,
    fontSize: 22,
    textAlign: "center",
    color: colors.spirit,
    minHeight: 60,
  },
  subtle: {
    ...font.caption,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: colors.textFaint,
    marginTop: spacing.sm,
  },

  // --- error styling ---
  deadGlyph: {
    fontSize: 44,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  errorTitle: {
    ...font.title,
    textAlign: "center",
  },
  errorSub: {
    ...font.body,
    color: colors.textDim,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.bg,
  },
  errorDetail: {
    ...font.caption,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
