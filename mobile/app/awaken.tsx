/**
 * Awaken Screen — Séance
 * Dark channeling screen shown while the backend processes the object photo.
 * Calls awaken() API, animates progress + log lines, then navigates to /reveal.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { awaken, type AwakenResponse } from '../src/api';
import { sessionStore } from '../src/sessionStore';
import { C, FONTS, SP } from '../src/theme';

// ── Log lines ─────────────────────────────────────────────────────────────────

// First wave — appears quickly as the call kicks off (~3s total)
const LOG_LINES_INITIAL = [
  'vessel identified',
  'reading its aura',
  'excavating memories',
  'forging a voice',
  'it stirs…',
];

// Second wave — cycles in one at a time while the API is still working.
// Kept atmospheric so a slow call feels intentional, not broken.
const LOG_LINES_WAITING = [
  'consulting the ether',
  'negotiating with shadows',
  'weaving the spirit cloth',
  'coaxing it forward',
  'almost there…',
  'the veil resists',
  'pulling harder',
  'binding the final thread',
];

// Minimum display time before navigating away (ms)
const MIN_DISPLAY_MS = 3500;

// How long each log line reveal is staggered (ms)
const LOG_STAGGER_MS = 580;

// How long between waiting lines after the initial batch finishes (ms)
const WAITING_LINE_INTERVAL_MS = 3200;

// ── Grain overlay ─────────────────────────────────────────────────────────────

function GrainOverlay() {
  return (
    <Image
      source={require('../assets/grain.png')}
      style={[StyleSheet.absoluteFillObject, { opacity: 0.35 }]}
      resizeMode="repeat"
    />
  );
}

// ── Log line component ────────────────────────────────────────────────────────

function LogLine({ text, index, visibleCount }: { text: string; index: number; visibleCount: number }) {
  const slideX = useRef(new Animated.Value(-18)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const visible = index < visibleCount;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideX, {
          toValue: 0,
          duration: 340,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideX, opacity]);

  const isDone = index < visibleCount - 1;
  const isActive = index === visibleCount - 1;

  return (
    <Animated.View
      style={[
        styles.logLine,
        { opacity, transform: [{ translateX: slideX }] },
      ]}
    >
      <Text style={[styles.logMark, isDone && styles.logMarkDone]}>
        {isDone ? '✓' : isActive ? '▸' : '·'}
      </Text>
      <Text style={[styles.logText, isDone && styles.logTextDone, isActive && styles.logTextActive]}>
        {text}
      </Text>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AwakenScreen() {
  const imageDataUrl = sessionStore.getImage();

  const [logLines, setLogLines] = useState<string[]>(LOG_LINES_INITIAL);
  const [visibleLogCount, setVisibleLogCount] = useState(0);
  const [statusText, setStatusText] = useState('channeling');
  const [progressPct, setProgressPct] = useState(0);
  const [failed, setFailed] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;

  const resultRef = useRef<AwakenResponse | null>(null);
  const apiDoneRef = useRef(false);
  const minTimeRef = useRef(false);
  const navigatedRef = useRef(false);

  function attemptNavigate() {
    if (
      apiDoneRef.current &&
      minTimeRef.current &&
      !navigatedRef.current &&
      resultRef.current
    ) {
      navigatedRef.current = true;
      sessionStore.setResult(resultRef.current);
      router.replace('/reveal');
    }
  }

  useEffect(() => {
    // Creep to 90% over ~6s; the final 10% only fills when the spirit actually
    // arrives — so a slow API reads as "still working", never frozen at 100%.
    progressAnim.addListener(({ value }) => setProgressPct(Math.round(value * 100)));
    Animated.timing(progressAnim, {
      toValue: 0.9,
      duration: 6000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    // Breathing animation for photo card
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1.03,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0.97,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breathe.start();

    // Initial log lines appear one by one
    const timers: ReturnType<typeof setTimeout>[] = [];
    LOG_LINES_INITIAL.forEach((_, i) => {
      const t = setTimeout(() => {
        setVisibleLogCount(i + 1);
      }, 400 + i * LOG_STAGGER_MS);
      timers.push(t);
    });

    // After initial batch, keep adding waiting lines every few seconds until
    // the API returns. Each new line replaces the list so only the latest
    // window of lines is shown (avoids an infinitely growing list).
    const initialBatchEnd = 400 + (LOG_LINES_INITIAL.length - 1) * LOG_STAGGER_MS + 800;
    LOG_LINES_WAITING.forEach((line, i) => {
      const t = setTimeout(() => {
        setLogLines([...LOG_LINES_INITIAL, ...LOG_LINES_WAITING.slice(0, i + 1)]);
        setVisibleLogCount(LOG_LINES_INITIAL.length + i + 1);
      }, initialBatchEnd + i * WAITING_LINE_INTERVAL_MS);
      timers.push(t);
    });

    // Minimum display timer
    const minTimer = setTimeout(() => {
      minTimeRef.current = true;
      attemptNavigate();
    }, MIN_DISPLAY_MS);

    // Call the API. On success we stash the result and fill the bar; on failure
    // we stay here with a retry, never navigating to a broken reveal screen.
    if (imageDataUrl) {
      awaken(imageDataUrl)
        .then((result) => {
          resultRef.current = result;
          apiDoneRef.current = true;
          setStatusText('spirit found');
          Animated.timing(progressAnim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: false,
          }).start();
          attemptNavigate();
        })
        .catch((err) => {
          console.error('awaken error', err);
          setStatusText('signal lost');
          setFailed(true);
        });
    } else {
      // Landed here with no captured image (e.g. a dev reload cleared the store).
      setStatusText('signal lost');
      setFailed(true);
    }

    return () => {
      breathe.stop();
      timers.forEach(clearTimeout);
      clearTimeout(minTimer);
      progressAnim.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Failure: the spirit never took form. Offer a way back instead of trapping
  // the user on a dead-end screen with no navigation.
  if (failed) {
    return (
      <SafeAreaView style={styles.safe}>
        <LinearGradient
          colors={['#241C16', '#100C0A']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <GrainOverlay />
        <View style={styles.content}>
          <Text style={styles.failTitle}>the connection wavered</Text>
          <Text style={styles.failHint}>
            The spirit slipped away before it could take form. Make sure the
            séance server is running, then try again.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.retryBtnText}>Summon another →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={['#241C16', '#100C0A']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <GrainOverlay />

      {/* Red-orange glow at top */}
      <View style={styles.topGlow} />

      <View style={styles.content}>
        {/* Photo card */}
        <View style={styles.photoCardWrap}>
          {/* Red-orange outer glow */}
          <View style={styles.glowRed} />
          {/* Teal inner glow */}
          <View style={styles.glowTeal} />
          <Animated.View
            style={[styles.photoCard, { transform: [{ scale: breatheAnim }] }]}
          >
            {imageDataUrl ? (
              <Image
                source={{ uri: imageDataUrl }}
                style={styles.photoImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.photoPlaceholder} />
            )}
            {/* Color overlay */}
            <LinearGradient
              colors={['rgba(255,90,56,0.18)', 'transparent', 'rgba(52,183,160,0.16)']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            {/* Halftone dot overlay */}
            <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <Defs>
                <Pattern id="dots" x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
                  <Circle cx="2.5" cy="2.5" r="1" fill="rgba(28,24,19,0.45)" />
                </Pattern>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#dots)" opacity="0.4" />
            </Svg>
          </Animated.View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFillWrap, { width: progressWidth }]}>
            <LinearGradient
              colors={['#34B7A0', '#FF5A38']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </View>

        {/* Progress labels */}
        <View style={styles.progressLabels}>
          <Text style={styles.channelingLabel}>{statusText.toUpperCase()}</Text>
          <Text style={styles.pctLabel}>{progressPct}%</Text>
        </View>

        {/* Log lines */}
        <View style={styles.logContainer}>
          {logLines.map((line, i) => (
            <LogLine
              key={`${i}-${line}`}
              text={line}
              index={i}
              visibleCount={visibleLogCount}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  topGlow: {
    position: 'absolute',
    top: '8%',
    left: '50%',
    marginLeft: -140,
    width: 280,
    height: 200,
    borderRadius: 140,
    backgroundColor: '#FF5A38',
    opacity: 0.22,
  },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SP.xl,
  },

  // Photo card wrapper with dual glow
  photoCardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SP.lg + 4,
  },
  glowRed: {
    position: 'absolute',
    width: 172,
    height: 212,
    borderRadius: 9,
    backgroundColor: '#FF5A38',
    opacity: 0.22,
    shadowColor: '#FF5A38',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 28,
    elevation: 0,
  },
  glowTeal: {
    position: 'absolute',
    width: 192,
    height: 232,
    borderRadius: 12,
    backgroundColor: '#34B7A0',
    opacity: 0.08,
    shadowColor: '#34B7A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 50,
    elevation: 0,
  },
  // Photo card
  photoCard: {
    width: 172,
    height: 212,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: C.amberBright,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: '#1A120D',
  },
  // Progress bar
  progressTrack: {
    width: 210,
    height: 3,
    backgroundColor: '#2B241E',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFillWrap: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 210,
    marginTop: 8,
    marginBottom: SP.lg,
  },
  channelingLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: '#FF5A38',
  },
  pctLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: C.textDimmer,
  },

  // Log lines
  logContainer: {
    width: 210,
  },
  logLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  logMark: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: C.textDim,
    width: 14,
    textAlign: 'center',
  },
  logMarkDone: {
    color: '#5A4F42',
  },
  logText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: C.textDim,
    letterSpacing: 0.5,
  },
  logTextActive: {
    color: C.textLight,
  },
  logTextDone: {
    color: '#8A7C68',
    opacity: 0.7,
  },

  // Failure state
  failTitle: {
    fontFamily: FONTS.serif,
    fontSize: 30,
    color: C.textLight,
    textAlign: 'center',
    marginBottom: 12,
  },
  failHint: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: C.textDim,
    textAlign: 'center',
    lineHeight: 19,
    letterSpacing: 0.4,
    marginBottom: 28,
    paddingHorizontal: SP.md,
  },
  retryBtn: {
    backgroundColor: '#D93D1A',
    borderWidth: 1,
    borderColor: '#7A1F0C',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 32,
  },
  retryBtnText: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    color: '#F0E7D6',
  },
});
