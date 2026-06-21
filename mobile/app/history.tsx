/**
 * History (The Ledger) — every object you've ever awakened, from Redis.
 *
 * Reads GET /api/history. Tapping a spirit re-opens the live conversation:
 * we fetch its full persona + transcript (GET /api/persona/:objectKey), hand it
 * off via sessionStore (same pattern as reveal → conversation), and navigate.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE } from '../src/constants';
import { fetchHistory, fetchPersona, type HistoryItem } from '../src/api';
import { sessionStore } from '../src/sessionStore';
import { C, FONTS, R, SP } from '../src/theme';

// A small palette so each card's accent bar differs, like the home ledger.
const TONES = [C.tealDeep, C.amber, C.red, C.teal, C.redDark];

// Portraits come back as data: URLs (mock/gemini) or http(s) URLs (pollinations);
// only a bare server path needs the API origin prepended.
function resolvePortrait(url: string): string {
  if (!url) return url;
  if (url.startsWith('data:') || /^https?:\/\//.test(url)) return url;
  return `${API_BASE}/${url.replace(/^\//, '')}`;
}

export default function HistoryScreen() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Reload every time the screen regains focus so a freshly-awakened object
  // shows up the moment you come back here.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setError(null);
      fetchHistory()
        .then((rows) => !cancelled && setItems(rows))
        .catch(() => !cancelled && setError("Couldn't reach the ledger."));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function openObject(item: HistoryItem) {
    if (busyKey) return;
    setBusyKey(item.objectKey);
    setError(null);
    try {
      const p = await fetchPersona(item.objectKey);
      sessionStore.setResult({
        persona: p.persona,
        portraitUrl: p.portraitUrl,
        encounters: p.encounters,
        returning: true,
        history: p.history,
      });
      router.push('/conversation');
    } catch {
      setError("Couldn't rouse that spirit. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  const renderItem = ({ item, index }: { item: HistoryItem; index: number }) => {
    const tone = TONES[index % TONES.length];
    const loading = busyKey === item.objectKey;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { borderLeftColor: tone },
          pressed && styles.cardPressed,
        ]}
        onPress={() => openObject(item)}
        disabled={!!busyKey}
      >
        <View style={styles.thumbWrap}>
          {item.portraitUrl ? (
            <Image
              source={{ uri: resolvePortrait(item.portraitUrl) }}
              style={styles.thumb}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Text style={styles.thumbGlyph}>◎</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardObj} numberOfLines={1}>
            {item.object} · ×{item.encounters}
          </Text>
          {!!item.lastMessage && (
            <Text style={styles.cardLast} numberOfLines={2}>
              “{item.lastMessage}”
            </Text>
          )}
        </View>

        <View style={styles.cardRight}>
          {loading ? (
            <ActivityIndicator color={tone} size="small" />
          ) : (
            <Text style={[styles.cardChevron, { color: tone }]}>›</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={[C.creamLight, C.creamMid]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>The Ledger</Text>
        <Text style={styles.subtitle}>
          {items ? `${items.length} ${items.length === 1 ? 'soul' : 'souls'} bound` : 'SOULS BOUND'}
        </Text>
        <View style={styles.rule} />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.amber} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyGlyph}>◎</Text>
          <Text style={styles.emptyText}>No spirits bound yet.</Text>
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.emptyLink}>
            <Text style={styles.emptyLinkText}>Summon your first object</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.objectKey}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },

  header: {
    paddingHorizontal: SP.md,
    paddingTop: 12,
    paddingBottom: SP.sm,
  },
  back: { marginBottom: 6 },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: C.textMuted,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 44,
    color: C.textDark,
    lineHeight: 44,
  },
  subtitle: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: C.amber,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  rule: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.amber,
    opacity: 0.35,
    marginTop: SP.md,
  },

  errorText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: C.red,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: SP.sm,
  },

  listContent: {
    paddingHorizontal: SP.md,
    paddingTop: SP.md,
    paddingBottom: 40,
    gap: SP.sm,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.creamBright,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: '#D8C9AC',
    borderLeftWidth: 4,
    padding: SP.sm,
  },
  cardPressed: { backgroundColor: '#EFE6D2' },
  thumbWrap: {
    width: 54,
    height: 54,
    borderRadius: R.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D8C9AC',
    marginRight: SP.sm,
  },
  thumb: { width: '100%', height: '100%' },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.creamMid,
  },
  thumbGlyph: { fontSize: 22, color: C.amber, opacity: 0.5 },

  cardBody: { flex: 1, minWidth: 0 },
  cardName: {
    fontFamily: FONTS.serif,
    fontSize: 19,
    color: C.textDark,
    lineHeight: 21,
  },
  cardObj: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: C.textMuted,
    letterSpacing: 0.8,
    marginTop: 1,
  },
  cardLast: {
    fontFamily: FONTS.serifItalic,
    fontSize: 13,
    color: C.textDimmer,
    marginTop: 4,
    lineHeight: 16,
  },
  cardRight: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardChevron: { fontFamily: FONTS.serif, fontSize: 28 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP.sm },
  emptyGlyph: { fontSize: 40, color: C.amber, opacity: 0.4 },
  emptyText: { fontFamily: FONTS.serif, fontSize: 22, color: C.textDark },
  emptyLink: { marginTop: SP.xs },
  emptyLinkText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: C.textMuted,
    textDecorationLine: 'underline',
    letterSpacing: 0.5,
  },
});
