/* global require, module */
const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");

const WIDGET_RECEIVERS = [
  {
    name: "expo.modules.papillonandroidwidgets.NextClassesWidgetProvider",
    label: "@string/widget_next_classes_title",
    resource: "@xml/widget_next_classes_info",
  },
  {
    name: "expo.modules.papillonandroidwidgets.LatestGradesWidgetProvider",
    label: "@string/widget_latest_grades_title",
    resource: "@xml/widget_latest_grades_info",
  },
  {
    name: "expo.modules.papillonandroidwidgets.TasksWidgetProvider",
    label: "@string/widget_tasks_title",
    resource: "@xml/widget_tasks_info",
  },
];

function upsertWidgetReceiver(receivers, widget) {
  const filtered = receivers.filter(
    receiver => receiver?.$?.["android:name"] !== widget.name
  );

  filtered.push({
    $: {
      "android:name": widget.name,
      "android:label": widget.label,
      "android:exported": "false",
    },
    "intent-filter": [
      {
        action: [
          {
            $: {
              "android:name": "android.appwidget.action.APPWIDGET_UPDATE",
            },
          },
        ],
      },
    ],
    "meta-data": [
      {
        $: {
          "android:name": "android.appwidget.provider",
          "android:resource": widget.resource,
        },
      },
    ],
  });

  return filtered;
}

function withAndroidWidgets(config) {
  return withAndroidManifest(config, modConfig => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      modConfig.modResults
    );

    let receivers = mainApplication.receiver || [];
    for (const widget of WIDGET_RECEIVERS) {
      receivers = upsertWidgetReceiver(receivers, widget);
    }
    mainApplication.receiver = receivers;

    return modConfig;
  });
}

module.exports = withAndroidWidgets;
