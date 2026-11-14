import { Papicons } from "@getpapillon/papicons";
import { useTheme } from "expo-router/react-navigation";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useAccountStore } from "@/stores/account";
import {
  DEFAULT_HOME_WIDGETS,
  getHomeWidgetsForAccount,
  useSettingsStore,
} from "@/stores/settings";
import { HomeWidgetConfig, HomeWidgetId } from "@/stores/settings/types";
import Icon from "@/ui/components/Icon";
import Stack from "@/ui/components/Stack";
import NativeSwitch from "@/ui/native/NativeSwitch";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";

interface WidgetMeta {
  id: HomeWidgetId;
  titleKey: string;
  descriptionKey: string;
  icon: string;
}

const WIDGET_METADATA = new Map<HomeWidgetId, WidgetMeta>([
  [
    "timetable",
    {
      id: "timetable",
      titleKey: "Home_Widget_NextCourses",
      descriptionKey: "Home_Widget_Timetable_Description",
      icon: "Calendar",
    },
  ],
  [
    "tasks",
    {
      id: "tasks",
      titleKey: "Home_Widget_NewHomeworks",
      descriptionKey: "Home_Widget_Tasks_Description",
      icon: "tasks",
    },
  ],
  [
    "grades_average",
    {
      id: "grades_average",
      titleKey: "Home_Widget_Grades_Average",
      descriptionKey: "Home_Widget_GradesAverage_Description",
      icon: "Grades",
    },
  ],
  [
    "latest_grades",
    {
      id: "latest_grades",
      titleKey: "Home_Widget_NewGrades",
      descriptionKey: "Home_Widget_LatestGrades_Description",
      icon: "Star",
    },
  ],
  [
    "news",
    {
      id: "news",
      titleKey: "Home_Widget_News",
      descriptionKey: "Home_Widget_News_Description",
      icon: "Newspaper",
    },
  ],
]);

const SettingsHomeWidgets = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const themeColors = colors as typeof colors & { overground?: string };
  const textColor = String(colors.text);

  const personalization = useSettingsStore(state => state.personalization);
  const mutateProperty = useSettingsStore(state => state.mutateProperty);
  const lastUsedAccount = useAccountStore(state => state.lastUsedAccount);

  const widgets = useMemo(
    () => getHomeWidgetsForAccount(personalization, lastUsedAccount),
    [personalization, lastUsedAccount]
  );

  const saveWidgets = (nextWidgets: HomeWidgetConfig[]) => {
    const existingByAccount = personalization?.homeWidgetsByAccount ?? {};
    const nextByAccount = { ...existingByAccount };
    if (lastUsedAccount) {
      nextByAccount[lastUsedAccount] = nextWidgets;
    }

    mutateProperty("personalization", {
      homeWidgets: nextWidgets,
      homeWidgetsByAccount: nextByAccount,
    });
  };

  const toggleWidget = (widgetId: HomeWidgetId) => {
    const nextWidgets = widgets.map(widget =>
      widget.id === widgetId ? { ...widget, enabled: !widget.enabled } : widget
    );
    saveWidgets(nextWidgets);
  };

  const moveWidget = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= widgets.length) {
      return;
    }

    const nextWidgets = [...widgets];
    const [moved] = nextWidgets.splice(index, 1);
    nextWidgets.splice(targetIndex, 0, moved);
    saveWidgets(nextWidgets);
  };

  const resetWidgets = () => {
    saveWidgets(DEFAULT_HOME_WIDGETS.map(widget => ({ ...widget })));
  };

  return (
    <List
      animated
      contentInsetAdjustmentBehavior="automatic"
      safeHorizontalPadding={16}
      contentContainerStyle={{ paddingVertical: 16 }}
      style={{
        flex: 1,
        backgroundColor: themeColors.overground ?? String(colors.background),
      }}
    >
      <List.Section id="home-widgets-list">
        {widgets.map((widget, index) => {
          const meta = WIDGET_METADATA.get(widget.id);
          if (!meta) {
            return null;
          }
          const isFirst = index === 0;
          const isLast = index === widgets.length - 1;

          return (
            <List.Item key={widget.id} id={widget.id}>
              <List.Leading>
                <Icon>
                  <Papicons name={meta.icon} />
                </Icon>
              </List.Leading>
              <Typography variant="title">{t(meta.titleKey)}</Typography>
              <Typography variant="body2" color="textSecondary">
                {t(meta.descriptionKey)}
              </Typography>
              <List.Trailing>
                <Stack direction="horizontal" vAlign="center" gap={6}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Pressable
                      hitSlop={8}
                      disabled={isFirst}
                      onPress={() => moveWidget(index, -1)}
                      style={{
                        padding: 6,
                        borderRadius: 10,
                        backgroundColor: textColor + "0F",
                        opacity: isFirst ? 0.3 : 1,
                      }}
                    >
                      <Papicons name="ChevronUp" size={16} color={textColor} />
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      disabled={isLast}
                      onPress={() => moveWidget(index, 1)}
                      style={{
                        padding: 6,
                        borderRadius: 10,
                        backgroundColor: textColor + "0F",
                        opacity: isLast ? 0.3 : 1,
                      }}
                    >
                      <Papicons
                        name="ChevronDown"
                        size={16}
                        color={textColor}
                      />
                    </Pressable>
                  </View>
                  <NativeSwitch
                    value={widget.enabled}
                    onValueChange={() => toggleWidget(widget.id)}
                  />
                </Stack>
              </List.Trailing>
            </List.Item>
          );
        })}
      </List.Section>

      <List.Section id="home-widgets-reset">
        <List.Item id="reset" onPress={resetWidgets}>
          <List.Leading>
            <Icon>
              <Papicons name="Cross" />
            </Icon>
          </List.Leading>
          <Typography variant="title">
            {t("Settings_HomeWidgets_Reset")}
          </Typography>
        </List.Item>
      </List.Section>
    </List>
  );
};

export default SettingsHomeWidgets;
