import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0d0d1a" },
          headerTintColor: "#c084fc",
          headerTitleStyle: { fontWeight: "bold" },
          contentStyle: { backgroundColor: "#0d0d1a" },
        }}
      />
    </>
  );
}
