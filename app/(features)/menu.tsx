import { Papicons } from "@getpapillon/papicons";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getCanteenMenuFromCache } from "@/database/useCanteen";
import { getManager, subscribeManagerUpdate } from "@/services/shared";
import { CanteenMenu, Food, Meal } from "@/services/shared/canteen";
import Stack from "@/ui/components/Stack";
import TabHeader from "@/ui/components/TabHeader";
import TabHeaderTitle from "@/ui/components/TabHeaderTitle";
import Typography from "@/ui/new/Typography";
import { warn } from "@/utils/logger/logger";

function startOfWeekMonday(baseDate: Date): Date {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDayHeading(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function hasAnyFood(meal?: Meal): boolean {
  if (!meal) return false;
  return Boolean(
    meal.entry?.length ||
      meal.main?.length ||
      meal.side?.length ||
      meal.cheese?.length ||
      meal.dessert?.length ||
      meal.drink?.length
  );
}

const MEAL_SECTIONS: Array<{ key: keyof Meal; label: string }> = [
  { key: "entry", label: "Entrée" },
  { key: "main", label: "Plat principal" },
  { key: "side", label: "Accompagnement" },
  { key: "cheese", label: "Fromage / Laitage" },
  { key: "dessert", label: "Dessert" },
  { key: "drink", label: "Boisson" },
];

function MealBlock({ title, meal }: { title: string; meal: Meal }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      <Typography variant="title" style={{ color: "#16A34A", fontSize: 15 }}>
        {title}
      </Typography>
      {MEAL_SECTIONS.map(sec => {
        const foods = (meal[sec.key] ?? []) as Food[];
        if (!foods.length) return null;
        return (
          <View
            key={sec.key}
            style={{
              backgroundColor: colors.background,
              borderRadius: 12,
              padding: 10,
              gap: 4,
            }}
          >
            <Typography variant="caption" color="textSecondary" style={{ fontWeight: "700" }}>
              {sec.label}
            </Typography>
            {foods.map((food, idx) => (
              <View key={`${food.name}-${idx}`} style={{ gap: 2 }}>
                <Typography variant="body1">{food.name}</Typography>
                {food.allergens && food.allergens.length > 0 && (
                  <Typography variant="caption" color="textSecondary">
                    Allergènes : {food.allergens.join(", ")}
                  </Typography>
                )}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export default function SchoolMenuScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(110);
  const [weekOffset, setWeekOffset] = useState(0);
  const [menus, setMenus] = useState<CanteenMenu[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const selectedWeekDate = useMemo(() => {
    const monday = startOfWeekMonday(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const weekLabel = useMemo(() => {
    const end = new Date(selectedWeekDate);
    end.setDate(end.getDate() + 4);
    return `${selectedWeekDate.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    })} — ${end.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    })}`;
  }, [selectedWeekDate]);

  const loadMenus = useCallback(async () => {
    setIsLoading(true);
    try {
      const cached = await getCanteenMenuFromCache(selectedWeekDate);
      if (cached && cached.length > 0) {
        setMenus(cached);
      }
      const manager = getManager();
      if (manager) {
        const fetched = await manager.getWeeklyCanteenMenu(selectedWeekDate);
        if (fetched && fetched.length > 0) {
          setMenus(fetched);
        } else if (!cached?.length) {
          setMenus([]);
        }
      }
    } catch (err) {
      warn(`Failed fetching school canteen menu: ${String(err)}`, "SchoolMenuScreen");
    } finally {
      setIsLoading(false);
    }
  }, [selectedWeekDate]);

  useEffect(() => {
    void loadMenus();
    const unsub = subscribeManagerUpdate(() => {
      void loadMenus();
    });
    return () => unsub();
  }, [loadMenus]);

  const sortedMenus = useMemo(() => {
    const weekStartMs = selectedWeekDate.getTime();
    const weekEndMs = weekStartMs + 7 * 86_400_000;
    return [...menus]
      .filter(m => {
        const t = new Date(m.date).getTime();
        return t >= weekStartMs && t < weekEndMs && (hasAnyFood(m.lunch) || hasAnyFood(m.dinner));
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [menus, selectedWeekDate]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TabHeader
        showAndroidBackButton
        modal
        onHeightChanged={setHeaderHeight}
        title={
          <TabHeaderTitle
            color="#46c700"
            leading="Menu du self"
            subtitle={weekLabel}
            loading={isLoading}
          />
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + 10,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 36,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => void loadMenus()}
            progressViewOffset={headerHeight}
          />
        }
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={() => setWeekOffset(prev => prev - 1)}
            style={{ paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Typography variant="title" style={{ color: String(colors.primary) }}>
              ← Préc.
            </Typography>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekOffset(0)}>
            <Typography variant="title">
              {weekOffset === 0 ? "Cette semaine" : weekLabel}
            </Typography>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setWeekOffset(prev => prev + 1)}
            style={{ paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Typography variant="title" style={{ color: String(colors.primary) }}>
              Suiv. →
            </Typography>
          </TouchableOpacity>
        </View>

        {isLoading && sortedMenus.length === 0 ? (
          <Stack padding={[24, 48]} hAlign="center" gap={12}>
            <ActivityIndicator size="large" color="#46c700" />
            <Typography variant="caption" color="textSecondary">
              Récupération du menu depuis Pronote...
            </Typography>
          </Stack>
        ) : sortedMenus.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Papicons name="Cutlery" size={40} color="#46c700" />
            <Typography variant="title" align="center">
              Aucun menu publié cette semaine
            </Typography>
            <Typography variant="caption" color="textSecondary" align="center">
              Si ton établissement publie les menus de la cantine sur Pronote, ils apparaîtront ici automatiquement.
            </Typography>
          </View>
        ) : (
          sortedMenus.map((day, idx) => {
            const d = new Date(day.date);
            const today = new Date();
            const isToday =
              d.getDate() === today.getDate() &&
              d.getMonth() === today.getMonth() &&
              d.getFullYear() === today.getFullYear();

            return (
              <View
                key={`${d.toISOString()}-${idx}`}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 20,
                  padding: 16,
                  borderWidth: isToday ? 1.5 : 1,
                  borderColor: isToday ? "#46c700" : colors.border,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="h4" style={{ textTransform: "capitalize" }}>
                    {formatDayHeading(d)}
                  </Typography>
                  {isToday && (
                    <View
                      style={{
                        backgroundColor: "#46c70022",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Typography variant="caption" style={{ color: "#16A34A", fontWeight: "700" }}>
                        Aujourd'hui
                      </Typography>
                    </View>
                  )}
                </View>

                {hasAnyFood(day.lunch) && day.lunch && (
                  <MealBlock title="Déjeuner" meal={day.lunch} />
                )}
                {hasAnyFood(day.dinner) && day.dinner && (
                  <MealBlock title="Dîner" meal={day.dinner} />
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
