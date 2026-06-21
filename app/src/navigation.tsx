import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AwakenResponse, EncounterLine, Persona } from "./types";
import CaptureScreen from "./screens/CaptureScreen";
import AwakeningScreen from "./screens/AwakeningScreen";
import RevealScreen from "./screens/RevealScreen";
import ConversationScreen from "./screens/ConversationScreen";
import EncounterScreen from "./screens/EncounterScreen";

// The screen flow, end to end:
//   Capture  → take a photo of an object
//   Awakening → "waking up…" while the persona is channeled (/api/awaken)
//   Reveal   → portrait + name + tagline + spoken opening line
//   Conversation → hold-to-talk voice chat (/api/converse)
//   Encounter → scripted scene between two awakened objects
export type RootStackParamList = {
  Capture: { challengerKey?: string } | undefined;
  Awakening: { imageDataUrl: string; challengerKey?: string };
  Reveal: { result: AwakenResponse; imageDataUrl: string; challengerKey?: string };
  Conversation: { result: AwakenResponse };
  Encounter: { lines: EncounterLine[]; persona1: Persona; persona2: Persona; portraitUrl1: string; portraitUrl2: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Capture"
      screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "#0b0612" } }}
    >
      <Stack.Screen name="Capture" component={CaptureScreen} />
      <Stack.Screen name="Awakening" component={AwakeningScreen} />
      <Stack.Screen name="Reveal" component={RevealScreen} />
      <Stack.Screen name="Conversation" component={ConversationScreen} />
      <Stack.Screen name="Encounter" component={EncounterScreen} />
    </Stack.Navigator>
  );
}
