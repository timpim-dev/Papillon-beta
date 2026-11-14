/* global require, module */
const {
  AndroidConfig,
  withAndroidManifest,
  withSettingsGradle,
} = require("@expo/config-plugins");

const WEAR_SERVICE_NAME =
  "expo.modules.papillonandroidwidgets.PhoneWearListenerService";
const WEAR_INCLUDE_SNIPPET = [
  "include ':wear'",
  "project(':wear').projectDir = new File(rootProject.projectDir, '../native/wear')",
].join("\n");

function upsertWearListenerService(services) {
  const filtered = services.filter(
    service => service?.$?.["android:name"] !== WEAR_SERVICE_NAME
  );

  filtered.push({
    $: {
      "android:name": WEAR_SERVICE_NAME,
      "android:exported": "true",
    },
    "intent-filter": [
      {
        action: [
          {
            $: {
              "android:name":
                "com.google.android.gms.wearable.MESSAGE_RECEIVED",
            },
          },
        ],
        data: [
          {
            $: {
              "android:scheme": "wear",
              "android:host": "*",
              "android:pathPrefix": "/papillon",
            },
          },
        ],
      },
    ],
  });

  return filtered;
}

function withWearOs(config) {
  const withManifest = withAndroidManifest(config, modConfig => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      modConfig.modResults
    );
    mainApplication.service = upsertWearListenerService(
      mainApplication.service || []
    );
    return modConfig;
  });

  return withSettingsGradle(withManifest, modConfig => {
    const contents = modConfig.modResults.contents || "";
    if (!contents.includes("include ':wear'")) {
      const separator = contents.endsWith("\n") ? "" : "\n";
      modConfig.modResults.contents = `${contents}${separator}${WEAR_INCLUDE_SNIPPET}\n`;
    }
    return modConfig;
  });
}

module.exports = withWearOs;
