/**
 * Capture Screen — Séance
 * Warm cream/sepia theme. User photographs an object to awaken its spirit.
 */
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionStore } from '../src/sessionStore';
import { fetchHistory, type HistoryItem } from '../src/api';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, FONTS, R, SP } from '../src/theme';

// ── Ledger accent palette (one per card) ───────────────────────────────────────

const LEDGER_TONES = [C.tealDeep, C.amber, C.red];


// ── Corner bracket decoration ─────────────────────────────────────────────────

function CornerBracket({
  position,
}: {
  position: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const iTop = position === 'tl' || position === 'tr';
  const isLeft = position === 'tl' || position === 'bl';
  return (
    <View
      style={[
        styles.corner,
        iTop ? styles.cornerTop : styles.cornerBottom,
        isLeft ? styles.cornerLeft : styles.cornerRight,
        {
          borderTopWidth: iTop ? 2 : 0,
          borderBottomWidth: !iTop ? 2 : 0,
          borderLeftWidth: isLeft ? 2 : 0,
          borderRightWidth: !isLeft ? 2 : 0,
          borderColor: C.amberBright,
        },
      ]}
    />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CaptureScreen() {
  const challengerResult = sessionStore.getChallenger();
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<HistoryItem[]>([]);

  const btnScale = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const redDotOpacity = useRef(new Animated.Value(0.5)).current;

  // Idempotent navigation: reset every time this screen regains focus, so a
  // double-tap can't push two awaken screens (and two awaken() calls).
  const navLock = useRef(false);
  useFocusEffect(useCallback(() => {
    navLock.current = false;
    // Refresh the ledger whenever we return here (e.g. after awakening a new object).
    fetchHistory().then(setLedger).catch(() => {});
  }, []));

  useEffect(() => {
    Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 3600, useNativeDriver: true })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(redDotOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(redDotOpacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    ).start();
  }, [scanAnim, redDotOpacity]);

  async function pickImageFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('Library access denied');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setPhoto(`data:image/jpeg;base64,${asset.base64}`);
        setError(null);
      }
    }
  }

  async function pickImageFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      // Fall back to library
      await pickImageFromLibrary();
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setPhoto(`data:image/jpeg;base64,${asset.base64}`);
        setError(null);
      }
    }
  }

  function onPressBtn() {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  }

  function handleSummon() {
    if (!photo) {
      setError('Photograph an object first');
      return;
    }
    if (navLock.current) return; // ignore double-taps
    navLock.current = true;
    onPressBtn();
    setError(null);
    setLoading(true);
    sessionStore.setImage(photo);
    router.push('/awaken');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={[C.creamLight, C.creamMid]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Image
        source={require('../assets/grain.png')}
        style={styles.grain}
        resizeMode="repeat"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Header ────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.tagline}>A SPIRIT MEDIUM FOR OBJECTS</Text>
          <Text style={styles.brand}>Séance</Text>

          {/* Separator row — or rival banner when in introduction mode */}
          {challengerResult ? (
            <View style={styles.rivalBanner}>
              <Text style={styles.rivalBannerText}>
                ✦ INTRODUCING{" "}
                {challengerResult.persona.name.toUpperCase()}
                {" "}TO…
              </Text>
            </View>
          ) : (
            <View style={styles.separatorRow}>
              <View style={styles.separatorLine} />
              <Text style={styles.separatorText}>POINT · SUMMON · SPEAK</Text>
              <View style={styles.separatorLine} />
            </View>
          )}
        </View>

        {/* ── Viewfinder ────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={pickImageFromCamera}
          style={styles.viewfinderWrap}
        >
          {/* Outer frame */}
          <View style={styles.viewfinder}>
            {photo ? (
              <Image
                source={{ uri: photo }}
                style={styles.viewfinderImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.viewfinderEmpty}>
                <Text style={styles.viewfinderEmptyIcon}>◎</Text>
                <Text style={styles.viewfinderEmptyText}>NO SUBJECT FRAMED</Text>
              </View>
            )}

            {/* Scan animation */}
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  transform: [{
                    translateY: scanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-130, 280],
                    }),
                  }],
                  height: 120,
                  backgroundColor: 'rgba(214,169,75,0.08)',
                },
              ]}
              pointerEvents="none"
            />

            {/* Inset vignette */}
            <LinearGradient
              colors={['rgba(15,11,9,0.5)', 'transparent', 'transparent', 'rgba(15,11,9,0.5)']}
              locations={[0, 0.25, 0.75, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />

            {/* Corner brackets */}
            <CornerBracket position="tl" />
            <CornerBracket position="tr" />
            <CornerBracket position="bl" />
            <CornerBracket position="br" />

            {/* Top-left label */}
            <View style={styles.vfLabelTopLeft}>
              <Animated.View style={[styles.redDot, { opacity: redDotOpacity }]} />
              <Text style={styles.vfLabelText}>VIEWFINDER</Text>
            </View>

            {/* Top-right label */}
            <View style={styles.vfLabelTopRight}>
              <Text style={styles.vfLabelText}>FRAME 037</Text>
            </View>

            {/* Bottom CTA */}
            <View style={styles.vfBottomCta}>
              <Text style={styles.vfBottomCtaText}>TAP TO LOAD YOUR OWN OBJECT</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Error message ─────────────────────────────── */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* ── Primary CTA button ────────────────────────── */}
        <Animated.View style={[styles.summonBtnWrap, { transform: [{ scale: btnScale }] }]}>
          <Pressable
            style={({ pressed }) => [
              styles.summonBtn,
              pressed && styles.summonBtnPressed,
              !photo && styles.summonBtnDisabled,
            ]}
            onPress={handleSummon}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.creamLight} size="small" />
            ) : (
              <>
                <Text style={styles.summonBtnTitle}>Summon the spirit</Text>
                <Text style={styles.summonBtnSub}>PRESS TO CHANNEL ✦</Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* ── Secondary link ────────────────────────────── */}
        <TouchableOpacity
          style={styles.libraryLink}
          onPress={pickImageFromLibrary}
          activeOpacity={0.7}
        >
          <Text style={styles.libraryLinkText}>
            or load a photo from your library
          </Text>
        </TouchableOpacity>

        {/* ── Ledger (real history from Redis) ──────────── */}
        <View style={styles.ledger}>
          <View style={styles.ledgerDivider} />
          <TouchableOpacity
            style={styles.ledgerHeader}
            onPress={() => router.push('/history')}
            activeOpacity={0.7}
          >
            <Text style={styles.ledgerLabel}>THE LEDGER</Text>
            <Text style={styles.ledgerCount}>
              {ledger.length > 0 ? `${ledger.length} bound · view all ›` : 'view all ›'}
            </Text>
          </TouchableOpacity>
          {ledger.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {ledger.slice(0, 3).map((entry, i) => (
                <TouchableOpacity
                  key={entry.objectKey}
                  activeOpacity={0.8}
                  onPress={() => router.push('/history')}
                  style={[styles.ledgerCard, { borderLeftColor: LEDGER_TONES[i % LEDGER_TONES.length], flex: 1, minWidth: 0 }]}
                >
                  <View style={styles.ledgerCardInner}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.ledgerName} numberOfLines={1}>{entry.name}</Text>
                      <Text style={styles.ledgerObj} numberOfLines={1}>{entry.object} · ×{entry.encounters}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.ledgerEmpty}>No spirits bound yet — summon one above.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 6,
    paddingHorizontal: SP.md,
  },
  tagline: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: C.amber,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  brand: {
    fontFamily: FONTS.serif,
    fontSize: 58,
    color: C.textDark,
    lineHeight: 50,
    marginBottom: 10,
  },
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    marginTop: 2,
  },
  separatorLine: {
    height: 1,
    width: 38,
    backgroundColor: C.amber,
  },
  separatorText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2.5,
    color: C.textMuted,
  },

  rivalBanner: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 0.75,
    borderColor: C.teal,
    borderRadius: 4,
    backgroundColor: 'rgba(52,183,160,0.07)',
  },
  rivalBannerText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: C.teal,
    textAlign: 'center',
  },

  // Viewfinder
  viewfinderWrap: {
    marginHorizontal: SP.md,
    marginVertical: 18,
  },
  viewfinder: {
    backgroundColor: C.bgCard,
    borderWidth: 6,
    borderColor: C.creamBright,
    borderRadius: R.sm,
    height: 280,
    overflow: 'hidden',
    position: 'relative',
    // Inset amber ring via shadow-trick — we use an inner border overlay
  },
  viewfinderImage: {
    width: '100%',
    height: '100%',
  },
  viewfinderEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.amber,
    margin: 1,
  },
  viewfinderEmptyIcon: {
    fontSize: 36,
    color: C.amber,
    opacity: 0.4,
    marginBottom: 8,
  },
  viewfinderEmptyText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: C.amber,
    opacity: 0.5,
  },

  // Corner brackets
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
  },
  cornerTop: { top: 10 },
  cornerBottom: { bottom: 10 },
  cornerLeft: { left: 10 },
  cornerRight: { right: 10 },

  // Viewfinder labels
  vfLabelTopLeft: {
    position: 'absolute',
    top: 10,
    left: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vfLabelTopRight: {
    position: 'absolute',
    top: 10,
    right: 38,
  },
  redDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.red,
  },
  vfLabelText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    color: C.amberBright,
    letterSpacing: 1.5,
  },
  vfBottomCta: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  vfBottomCtaText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 2,
    color: C.amberBright,
    backgroundColor: 'rgba(15,11,9,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },

  // Error
  errorText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: C.red,
    textAlign: 'center',
    marginBottom: SP.sm,
    letterSpacing: 1,
  },

  // Summon button
  summonBtnWrap: {
    marginHorizontal: SP.md,
    marginBottom: SP.sm,
    // Simulate amber drop shadow
    shadowColor: C.redDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 8,
    borderRadius: R.md,
  },
  summonBtn: {
    backgroundColor: C.red,
    borderWidth: 1.5,
    borderColor: C.redDeeper,
    borderRadius: R.md,
    paddingVertical: 16,
    paddingHorizontal: SP.lg,
    alignItems: 'center',
    minHeight: 62,
    justifyContent: 'center',
  },
  summonBtnPressed: {
    backgroundColor: C.redDark,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  summonBtnDisabled: {
    opacity: 0.6,
  },
  summonBtnTitle: {
    fontFamily: FONTS.serif,
    fontSize: 23,
    color: C.creamLight,
    lineHeight: 26,
  },
  summonBtnSub: {
    fontFamily: FONTS.mono,
    fontSize: 8.5,
    letterSpacing: 2.5,
    color: C.creamDark,
    opacity: 0.85,
    marginTop: 2,
  },

  // Library link
  libraryLink: {
    alignItems: 'center',
    marginBottom: SP.lg,
    marginTop: SP.xs,
  },
  libraryLinkText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: C.textMuted,
    textDecorationLine: 'underline',
    letterSpacing: 0.5,
  },

  // Ledger
  ledger: {
    marginHorizontal: SP.md,
  },
  ledgerDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.amber,
    opacity: 0.35,
    marginBottom: SP.md,
  },
  ledgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SP.sm,
  },
  ledgerLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: C.textMuted,
    textTransform: 'uppercase',
  },
  ledgerCount: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: C.textDimmer,
  },
  ledgerEmpty: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 0.5,
    paddingVertical: SP.sm,
  },
  ledgerCard: {
    borderLeftWidth: 3,
    backgroundColor: C.creamBright,
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D8C9AC',
  },
  ledgerCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  ledgerName: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: C.textDark,
    marginBottom: 1,
  },
  ledgerObj: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    color: C.textMuted,
    letterSpacing: 0.8,
  },
});
