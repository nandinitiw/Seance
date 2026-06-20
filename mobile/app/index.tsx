/**
 * Minimal launcher screen for Task 4 standalone testing.
 * In production this is replaced by Task 3's camera/awaken screen.
 *
 * Usage:
 *   1. Run the backend: cd .. && npm run dev
 *   2. Awaken an object via the web UI or curl so an objectKey exists in memory.
 *   3. Paste the objectKey here → Go → talk to it.
 */
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function IndexScreen() {
  const [objectKey, setObjectKey] = useState("demo-object");

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.center}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Text style={s.title}>🔮 Séance</Text>
        <Text style={s.sub}>Voice test launcher</Text>

        <Text style={s.label}>Object key</Text>
        <TextInput
          style={s.input}
          value={objectKey}
          onChangeText={setObjectKey}
          placeholder="e.g. red-stapler"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable
          style={({ pressed }) => [s.btn, pressed && s.btnPressed]}
          onPress={() =>
            router.push({ pathname: "/conversation", params: { objectKey } })
          }
          disabled={!objectKey.trim()}
        >
          <Text style={s.btnText}>Awaken it</Text>
        </Pressable>

        <Text style={s.hint}>
          Awaken an object first via the backend, then paste its objectKey above.{"\n"}
          Task 3 will replace this screen with the real camera UI.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0d0d1a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  title: { fontSize: 40, color: "#c084fc", marginBottom: 4 },
  sub: { fontSize: 14, color: "#777", marginBottom: 40 },
  label: { alignSelf: "flex-start", color: "#aaa", fontSize: 12, marginBottom: 6 },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#3f3f60",
    borderRadius: 10,
    padding: 14,
    color: "#fff",
    fontSize: 16,
    marginBottom: 16,
  },
  btn: {
    width: "100%",
    backgroundColor: "#7c3aed",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  btnPressed: { opacity: 0.7 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hint: { color: "#555", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
