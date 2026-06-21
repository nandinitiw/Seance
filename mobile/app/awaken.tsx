/**
 * Awaken Screen — Séance
 * Dark channeling screen shown while the backend processes the object photo.
 * Calls awaken() API, animates progress + log lines, then navigates to /reveal.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { awaken, type AwakenResponse } from '../src/api';
import { C, FONTS, SP } from '../src/theme';

// ── Log lines ─────────────────────────────────────────────────────────────────

const LOG_LINES = [
  'vessel identified',
  'reading its aura',
  'excavating memories',
  'forging a voice',
  'it stirs…',
];

// Minimum display time before navigating away (ms)
const MIN_DISPLAY_MS = 3500;

// How long each log line reveal is staggered (ms)
const LOG_STAGGER_MS = 580;

// ── Grain overlay (approximation) ────────────────────────────────────────────

function GrainOverlay() {
  // Dots pattern approximated with a repeating View grid (subtle).
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={styles.grainOverlay} />
    </View>
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
  const { imageDataUrl } = useLocalSearchParams<{ imageDataUrl: string }>();

  const [visibleLogCount, setVisibleLogCount] = useState(0);
  const [statusText, setStatusText] = useState('channeling');
  const [progressPct, setProgressPct] = useState(0);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;

  const resultRef = useRef<AwakenResponse | null>(null);
  const apiDoneRef = useRef(false);
  const minTimeRef = useRef(false);
  const navigatedRef = useRef(false);

  function attemptNavigate() {
    if (apiDoneRef.current && minTimeRef.current && !navigatedRef.current) {
      navigatedRef.current = true;
      router.replace({
        pathname: '/reveal',
        params: { personaJson: JSON.stringify(resultRef.current) },
      });
    }
  }

  useEffect(() => {
    // Progress bar animation over ~3.2s
    progressAnim.addListener(({ value }) => setProgressPct(Math.round(value * 100)));
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3200,
      easing: Easing.inOut(Easing.quad),
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

    // Log lines appear one by one
    const timers: ReturnType<typeof setTimeout>[] = [];
    LOG_LINES.forEach((_, i) => {
      const t = setTimeout(() => {
        setVisibleLogCount(i + 1);
      }, 400 + i * LOG_STAGGER_MS);
      timers.push(t);
    });

    // Minimum display timer
    const minTimer = setTimeout(() => {
      minTimeRef.current = true;
      attemptNavigate();
    }, MIN_DISPLAY_MS);

    // Call the API
    if (imageDataUrl) {
      awaken(imageDataUrl)
        .then((result) => {
          resultRef.current = result;
          apiDoneRef.current = true;
          setStatusText('spirit found');
          attemptNavigate();
        })
        .catch((err) => {
          console.error('awaken error', err);
          // Still navigate after min time with null (reveal screen handles error)
          resultRef.current = null;
          apiDoneRef.current = true;
          setStatusText('signal lost');
          attemptNavigate();
        });
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

  return (
    <SafeAreaView style={styles.safe}>
      <GrainOverlay />

      {/* Red-orange glow at top */}
      <View style={styles.topGlow} />

      <View style={styles.content}>
        {/* Photo card */}
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
          {/* Halftone overlay approximation */}
          <LinearGradient
            colors={['rgba(255,90,56,0.18)', 'transparent', 'rgba(52,183,160,0.16)']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        </Animated.View>

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
          <Text style={styles.channelingLabel}>CHANNELING</Text>
          <Text style={styles.pctLabel}>{progressPct}%</Text>
        </View>

        {/* Log lines */}
        <View style={styles.logContainer}>
          {LOG_LINES.map((line, i) => (
            <LogLine
              key={line}
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
    backgroundColor: C.bgAlt,
  },

  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    opacity: 0.03,
    // Subtle noise approximation via alternating pattern not possible in RN without SVG,
    // so we leave this as a very faint overlay.
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

  // Photo card
  photoCard: {
    width: 172,
    height: 212,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: C.amberBright,
    overflow: 'hidden',
    marginBottom: SP.lg + 4,
    // Shadow
    shadowColor: '#FF5A38',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
    elevation: 12,
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
});
