module.exports = {
  expo: {
    name: "Séance",
    slug: "seance",
    version: "0.1.0",
    scheme: "seance",
    orientation: "portrait",
    ios: {
      bundleIdentifier: "com.seance.app",
      supportsTablet: false,
    },
    android: {
      package: "com.seance.app",
    },
    plugins: [
      "expo-router",
      "expo-camera",
      [
        "react-native-deepgram",
        {
          microphonePermission:
            "Séance needs your mic so objects can hear you and talk back.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
