module.exports = {
  expo: {
    name: "Séance",
    slug: "seance",
    version: "0.1.0",
    scheme: "seance",
    orientation: "portrait",
    ios: {
      bundleIdentifier: "com.aishanisingh.seance",
      supportsTablet: false,
    },
    android: {
      package: "com.aishanisingh.seance",
    },
    plugins: [
      "expo-router",
      "expo-camera",
      [
        "expo-image-picker",
        {
          photosPermission: "Séance needs your photo library to let you load an object.",
          cameraPermission: "Séance needs your camera so you can photograph objects.",
        },
      ],
      [
        "expo-av",
        {
          microphonePermission:
            "Séance needs your mic so objects can hear you and talk back.",
        },
      ],
    ],
    newArchEnabled: false,
    experiments: {
      typedRoutes: true,
    },
  },
};
