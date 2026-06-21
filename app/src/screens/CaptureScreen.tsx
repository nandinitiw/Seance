import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { colors, spacing, radius, font } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Capture">;

// The séance begins here: point the back camera at an object, snap it, and
// hand a JPEG data-URL off to the Awakening screen to be channeled.
function slugToLabel(key: string): string {
  return key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CaptureScreen({ navigation, route }: Props) {
  const challengerKey = (route.params as any)?.challengerKey as string | undefined;
  const challengerLabel = challengerKey ? slugToLabel(challengerKey) : undefined;
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  // Pre-warm the mic so the later voice chat doesn't prompt cold. We never
  // block the UI on this — it's a quiet, best-effort request.
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  const [busy, setBusy] = useState(false); // mid-capture / mid-pick
  const [error, setError] = useState<string | null>(null);

  // Ask for camera access on first mount if the user hasn't decided yet.
  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) {
      requestCamPerm();
    }
  }, [camPerm]);

  // Once the camera's blessed, quietly pre-warm the microphone too.
  useEffect(() => {
    if (camPerm?.granted && micPerm && !micPerm.granted && micPerm.canAskAgain) {
      requestMicPerm().catch(() => {
        /* the spirits can wait — mic is requested again later if needed */
      });
    }
  }, [camPerm?.granted, micPerm?.granted]);

  // Turn a base64 blob into a data-URL and send it onward to be awakened.
  function awaken(base64?: string | null) {
    if (!base64) {
      setError("The image came back empty. Try again.");
      return;
    }
    navigation.navigate("Awakening", {
      imageDataUrl: `data:image/jpeg;base64,${base64}`,
      ...(challengerKey ? { challengerKey } : {}),
    });
  }

  async function handleCapture() {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        skipProcessing: false,
      });
      awaken(photo?.base64);
    } catch (e) {
      setError("Couldn't capture that. Hold steady and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFromLibrary() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // The picker requests its own permission as needed.
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.6,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled) return;
      awaken(result.assets?.[0]?.base64);
    } catch (e) {
      setError("Couldn't open your library.");
    } finally {
      setBusy(false);
    }
  }

  // ── Permission gates ──────────────────────────────────────────────────────

  // Still loading the permission object on first render.
  if (!camPerm) {
    return (
      <Shell>
        <View style={styles.center}>
          <ActivityIndicator color={colors.spirit} />
        </View>
      </Shell>
    );
  }

  // Permanently denied — point them at Settings.
  if (!camPerm.granted && !camPerm.canAskAgain) {
    return (
      <Shell>
        <View style={styles.center}>
          <Text style={styles.bigGlyph}>👁️</Text>
          <Text style={styles.gateTitle}>The veil is closed</Text>
          <Text style={styles.gateBody}>
            Camera access is off, so Séance can't see. Open Settings to let the
            spirits through.
          </Text>
          <PrimaryButton label="Open Settings" onPress={() => Linking.openSettings()} />
        </View>
      </Shell>
    );
  }

  // Undetermined — friendly first-ask prompt.
  if (!camPerm.granted) {
    return (
      <Shell>
        <View style={styles.center}>
          <Text style={styles.bigGlyph}>🔮</Text>
          <Text style={styles.gateTitle}>Séance needs to see through your camera</Text>
          <Text style={styles.gateBody}>
            Point at any object and we'll wake the spirit inside. We only look
            when you tap to capture.
          </Text>
          <PrimaryButton label="Grant camera access" onPress={requestCamPerm} />
        </View>
      </Shell>
    );
  }

  // ── Live preview ──────────────────────────────────────────────────────────

  return (
    <Shell>
      <View style={styles.header}>
        <Text style={styles.title}>🔮 Séance</Text>
        {challengerLabel ? (
          <View style={styles.rivalBanner}>
            <Text style={styles.rivalBannerText}>⚔  Finding a rival for {challengerLabel}</Text>
          </View>
        ) : (
          <Text style={styles.subtitle}>Point at any object. Wake the spirit inside.</Text>
        )}
      </View>

      <View style={styles.viewport}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        {/* A faint cyan vignette so the preview feels haunted, not clinical. */}
        <View pointerEvents="none" style={styles.vignette} />
        <View pointerEvents="none" style={styles.viewportEdge} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.controls}>
        <PrimaryButton
          label={busy ? "Channeling…" : challengerLabel ? "Awaken the rival" : "Awaken what I'm pointing at"}
          onPress={handleCapture}
          disabled={busy}
          loading={busy}
        />
        <Pressable
          onPress={handlePickFromLibrary}
          disabled={busy}
          hitSlop={8}
          style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.link}>Pick from library</Text>
        </Pressable>
      </View>
    </Shell>
  );
}

// ── Local helper components ───────────────────────────────────────────────────

// Shared dark-violet frame for every state of this screen.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {children}
    </SafeAreaView>
  );
}

// The candle-amber pill — our one true call to action.
function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.cta,
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.55 },
      ]}
    >
      {loading ? <ActivityIndicator color={colors.bg} style={{ marginRight: spacing.sm }} /> : null}
      <Text style={styles.ctaText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  title: { ...font.display, letterSpacing: 1 },
  subtitle: { ...font.caption, textAlign: "center" },
  rivalBanner: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "rgba(230,175,60,0.10)",
  },
  rivalBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
    textAlign: "center",
  },

  // Camera preview frame.
  viewport: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    backgroundColor: "transparent",
    borderWidth: 24,
    borderColor: "rgba(11,6,18,0.45)", // dark inner frame fakes a vignette
  },
  viewportEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.spiritDim, // ghostly cyan rim
  },

  controls: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: "center",
    gap: spacing.md,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    // a warm candle-glow under the button
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.bg, // dark text on amber
  },
  linkWrap: { paddingVertical: spacing.xs },
  link: {
    ...font.caption,
    color: colors.spirit,
    textDecorationLine: "underline",
  },

  error: {
    ...font.caption,
    color: colors.danger,
    textAlign: "center",
    marginTop: spacing.sm,
  },

  // Permission-gate styling.
  bigGlyph: { fontSize: 56 },
  gateTitle: { ...font.title, textAlign: "center" },
  gateBody: {
    ...font.body,
    color: colors.textDim,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
  },
});
