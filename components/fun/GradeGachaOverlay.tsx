import { Papicons } from "@getpapillon/papicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import Wallpaper from "@/app/(tabs)/index/atoms/Wallpaper";
import { Grade, Subject } from "@/services/shared/grade";
import { useSettingsStore } from "@/stores/settings";
import Button from "@/ui/components/Button";
import SafeHorizontalView, { SAFE_HORIZONTAL_EDGES } from "@/ui/components/SafeHorizontalView";
import CompactGrade from "@/ui/new/CompactGrade";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import adjust from "@/utils/adjustColor";
import {
  EvaluatedGradeGacha,
  evaluateGradeGacha,
  FunOpeningStyle,
  GACHA_RARITIES,
  GACHA_TIER_ORDER,
  getOpenedGradeGachaCount,
  markGradeGachaOpened,
} from "@/utils/fun/gradeGacha";
import { formatGradeScoreForDisplay, getGradeDisplayScale } from "@/utils/grades/scale";
import i18n from "@/utils/i18n";

export interface GachaQueueItem {
  grade: Grade;
  subject: Subject;
  subjectName: string;
  subjectEmoji: string;
}

interface GradeGachaOverlayProps {
  items: GachaQueueItem[];
  topInset?: number;
  bottomInset?: number;
  onComplete: () => void;
  onBack?: () => void;
  onSelectGrade?: (gradeId: string) => void;
}

interface OpenedSessionEntry {
  item: GachaQueueItem;
  evaluation: EvaluatedGradeGacha;
  scoreValue: string;
  scoreDenominator: string;
}

interface ParticleSpec {
  id: number;
  angleRad: number;
  distance: number;
  fallOffset: number;
  size: number;
  isPill: boolean;
  delayMs: number;
  spinDeg: number;
}

const GeometricParticle = ({
  spec,
  active,
  color,
}: {
  spec: ParticleSpec;
  active: boolean;
  color: string;
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withDelay(
        spec.delayMs,
        withTiming(1, {
          duration: 950,
          easing: Easing.out(Easing.cubic),
        })
      );
    } else {
      progress.value = 0;
    }
  }, [active, progress, spec.delayMs]);

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const x = Math.cos(spec.angleRad) * spec.distance * p;
    const y =
      Math.sin(spec.angleRad) * spec.distance * p +
      spec.fallOffset * p * p;
    const scale = interpolate(p, [0, 0.15, 0.78, 1], [0.2, 1.05, 1, 0.25]);
    const opacity = interpolate(p, [0, 0.1, 0.78, 1], [0, 0.85, 0.8, 0]);
    const rotate = `${spec.spinDeg * p}deg`;
    return {
      opacity,
      transform: [{ translateX: x }, { translateY: y }, { scale }, { rotate }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          width: spec.size,
          height: spec.isPill ? spec.size * 0.52 : spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
};

export const GradeGachaOverlay: React.FC<GradeGachaOverlayProps> = ({
  items,
  topInset = 0,
  bottomInset = 0,
  onComplete,
  onBack,
  onSelectGrade,
}) => {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, topInset);
  const safeBottom = Math.max(insets.bottom, bottomInset);
  const theme = useTheme();
  const colors = theme.colors as typeof theme.colors & { overground?: string; item?: string };
  const cardColor = String(colors.card);
  const itemColor = String(colors.item ?? colors.card);
  const borderColor = String(colors.border);
  const bgColor = String(colors.background);
  const surfaceBg = Platform.OS === "ios" && colors.overground ? String(colors.overground) : bgColor;

  const displayScale = getGradeDisplayScale(
    useSettingsStore(state => state.personalization.gradesDisplayScale)
  );
  const openingStyle: FunOpeningStyle = useSettingsStore(
    state => state.personalization.funModeOpeningStyle ?? "envelope"
  );

  const [queueIndex, setQueueIndex] = useState(0);
  const [tapStep, setTapStep] = useState(0);
  const [phase, setPhase] = useState<"tapping" | "card" | "summary">("tapping");
  const [upgradedNotice, setUpgradedNotice] = useState<string | null>(null);
  const [openedSession, setOpenedSession] = useState<OpenedSessionEntry[]>([]);
  const [baseDropNumber] = useState(() => getOpenedGradeGachaCount() + 1);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentItem = items[Math.min(queueIndex, Math.max(0, items.length - 1))];
  const formattedScore = useMemo(
    () =>
      currentItem
        ? formatGradeScoreForDisplay(currentItem.grade.studentScore, currentItem.grade.outOf, displayScale)
        : { value: "0", denominator: "" },
    [currentItem, displayScale]
  );
  const evaluation = useMemo(
    () =>
      currentItem
        ? evaluateGradeGacha(currentItem.grade)
        : evaluateGradeGacha({
            id: "",
            subjectId: "",
            subjectName: "",
            description: "",
            givenAt: new Date(),
            coefficient: 1,
            createdByAccount: "",
          }),
    [currentItem]
  );

  const [rollingText, setRollingText] = useState<string>(formattedScore.value);

  const activeConfig =
    phase === "card"
      ? evaluation.config
      : GACHA_RARITIES[evaluation.upgradePath[Math.min(tapStep, 3)]];

  const particleSpecs = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: 20 }, (_, idx) => {
        const angle = (idx / 20) * Math.PI * 2 + ((idx % 3) - 1) * 0.12;
        const dist = 92 + ((idx * 37) % 110);
        return {
          id: idx,
          angleRad: angle,
          distance: dist,
          fallOffset: 90 + ((idx * 19) % 75),
          size: 7 + (idx % 4) * 2,
          isPill: idx % 2 === 0,
          delayMs: (idx % 4) * 28,
          spinDeg: (idx % 2 === 0 ? 1 : -1) * (160 + (idx % 5) * 65),
        };
      }),
    []
  );

  const iconScale = useSharedValue(1);
  const iconRotate = useSharedValue(0);
  const idleFloat = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);
  const revealTranslateY = useSharedValue(28);
  const revealScale = useSharedValue(0.95);
  const revealOpacity = useSharedValue(0);
  const pillScale = useSharedValue(1);

  useEffect(() => {
    idleFloat.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, [idleFloat]);

  useEffect(() => {
    if (phase !== "card" || !currentItem) return;
    const parsedTarget = Number(formattedScore.value.replace(",", "."));
    if (!Number.isFinite(parsedTarget) || currentItem.grade.studentScore?.disabled) {
      setRollingText(formattedScore.value);
      return;
    }

    const start = Date.now();
    const duration = 450;
    let frameId = 0;

    const step = () => {
      const elapsed = Date.now() - start;
      const ratio = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      const current = parsedTarget * eased;
      setRollingText(current.toFixed(displayScale === "percentage" ? 0 : 2));
      if (ratio < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setRollingText(formattedScore.value);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [currentItem, displayScale, formattedScore.value, phase]);

  const recordCurrentAsOpened = useCallback(() => {
    if (!currentItem) return;
    markGradeGachaOpened(currentItem.grade, evaluation.tier);
    setOpenedSession(prev => {
      if (prev.some(e => e.item.grade.id === currentItem.grade.id)) return prev;
      return [
        ...prev,
        {
          item: currentItem,
          evaluation,
          scoreValue: formattedScore.value,
          scoreDenominator: formattedScore.denominator,
        },
      ];
    });
  }, [currentItem, evaluation, formattedScore.denominator, formattedScore.value]);

  const finishAndClose = useCallback(() => {
    recordCurrentAsOpened();
    onComplete();
  }, [onComplete, recordCurrentAsOpened]);

  const triggerReveal = useCallback(() => {
    setPhase("card");
    recordCurrentAsOpened();

    revealTranslateY.value = 28;
    revealScale.value = 0.95;
    revealOpacity.value = 0;
    revealTranslateY.value = withSpring(0, { damping: 16, stiffness: 180 });
    revealScale.value = withSpring(1, { damping: 14, stiffness: 190 });
    revealOpacity.value = withTiming(1, { duration: 210 });

    const tierIndex = GACHA_TIER_ORDER.indexOf(evaluation.tier);
    if (tierIndex >= 5) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (tierIndex <= 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [evaluation.tier, recordCurrentAsOpened, revealOpacity, revealScale, revealTranslateY]);

  const resetTapVisuals = useCallback(() => {
    setTapStep(0);
    setUpgradedNotice(null);
    iconScale.value = 1;
    iconRotate.value = 0;
    revealOpacity.value = 0;
    revealScale.value = 0.95;
    revealTranslateY.value = 28;
  }, [iconRotate, iconScale, revealOpacity, revealScale, revealTranslateY]);

  const handleNextInQueue = useCallback(() => {
    if (queueIndex < items.length - 1) {
      resetTapVisuals();
      setQueueIndex(prev => prev + 1);
      setPhase("tapping");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else if (openedSession.length > 1) {
      setPhase("summary");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      onComplete();
    }
  }, [items.length, onComplete, openedSession.length, queueIndex, resetTapVisuals]);

  const handleIconTap = useCallback(() => {
    if (phase !== "tapping") return;

    const nextStep = tapStep + 1;
    ringScale.value = 0.72;
    ringOpacity.value = 0.5;
    ringScale.value = withTiming(2.1, { duration: 440, easing: Easing.out(Easing.quad) });
    ringOpacity.value = withTiming(0, { duration: 440, easing: Easing.out(Easing.quad) });

    if (nextStep >= 4) {
      iconScale.value = withSequence(
        withTiming(1.16, { duration: 85 }),
        withTiming(0.84, { duration: 120 })
      );
      triggerReveal();
      return;
    }

    const prevTier = evaluation.upgradePath[Math.min(tapStep, 3)];
    const nextTier = evaluation.upgradePath[Math.min(nextStep, 3)];
    const leveledUp =
      GACHA_TIER_ORDER.indexOf(nextTier) > GACHA_TIER_ORDER.indexOf(prevTier);

    setTapStep(nextStep);

    iconScale.value = withSequence(
      withTiming(0.88, { duration: 60 }),
      withSpring(1.12, { damping: 10, stiffness: 260 }),
      withSpring(1, { damping: 14, stiffness: 190 })
    );
    iconRotate.value = withSequence(
      withTiming(-8, { duration: 48 }),
      withTiming(8, { duration: 55 }),
      withTiming(-4, { duration: 48 }),
      withSpring(0, { damping: 12 })
    );

    if (leveledUp) {
      pillScale.value = withSequence(
        withSpring(1.18, { damping: 10, stiffness: 240 }),
        withSpring(1, { damping: 13 })
      );
      setUpgradedNotice(`Palier ${GACHA_RARITIES[nextTier].label}`);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setUpgradedNotice(null), 900);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    } else if (nextStep >= 2) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [
    evaluation.upgradePath,
    iconRotate,
    iconScale,
    phase,
    pillScale,
    ringOpacity,
    ringScale,
    tapStep,
    triggerReveal,
  ]);

  const handleReplaySingle = useCallback(() => {
    resetTapVisuals();
    setPhase("tapping");
  }, [resetTapVisuals]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: idleFloat.value },
      { scale: iconScale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
  }));

  const ringAnimStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const revealAnimStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ translateY: revealTranslateY.value }, { scale: revealScale.value }],
  }));

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pillScale.value }],
  }));

  const remainingCount = Math.max(0, items.length - 1 - queueIndex);
  const tapIconName = openingStyle === "gift" ? "Archive" : "Mail";
  const tapPrompt =
    tapStep === 0
      ? "Appuie pour ouvrir"
      : tapStep === 1
        ? "Encore un appui"
        : tapStep === 2
          ? "Bientôt ouvert"
          : "Dernier appui";

  const summaryRarityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of openedSession) {
      counts.set(entry.evaluation.tier, (counts.get(entry.evaluation.tier) ?? 0) + 1);
    }
    return [...GACHA_TIER_ORDER]
      .reverse()
      .filter(tier => (counts.get(tier) ?? 0) > 0)
      .map(tier => ({
        config: GACHA_RARITIES[tier],
        count: counts.get(tier) ?? 0,
      }));
  }, [openedSession]);

  const groupedSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        subjectId: string;
        subjectName: string;
        subjectEmoji: string;
        entries: OpenedSessionEntry[];
      }
    >();
    for (const entry of openedSession) {
      const key = entry.item.subject.id || entry.item.subjectName;
      const existing = map.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        map.set(key, {
          subjectId: key,
          subjectName: entry.item.subjectName,
          subjectEmoji: entry.item.subjectEmoji,
          entries: [entry],
        });
      }
    }
    return Array.from(map.values());
  }, [openedSession]);

  if (!currentItem) {
    return null;
  }

  const cardDetailRows: Array<{
    key: string;
    icon: string;
    title: string;
    subtitle?: string;
    trailing?: string;
    tint?: string;
  }> = [
    {
      key: "quip",
      icon: activeConfig.iconName,
      title: evaluation.quip,
      subtitle: `Palier ${activeConfig.label}`,
      tint: activeConfig.color,
    },
  ];
  if (evaluation.isClassMax) {
    cardDetailRows.push({
      key: "classMax",
      icon: "Crown",
      title: "Meilleure note de la classe",
      tint: activeConfig.color,
    });
  }
  if (evaluation.deltaFromClass20 !== null) {
    cardDetailRows.push({
      key: "delta",
      icon: "Grades",
      title: "Écart avec la classe",
      trailing: `${evaluation.deltaFromClass20 >= 0 ? "+" : ""}${evaluation.deltaFromClass20} pts`,
    });
  }
  if (typeof currentItem.grade.coefficient === "number") {
    cardDetailRows.push({
      key: "coef",
      icon: "Coefficient",
      title: "Coefficient",
      trailing: String(currentItem.grade.coefficient),
    });
  }

  return (
    <View style={[styles.root, { backgroundColor: surfaceBg }]}>
      <Wallpaper height={260} dim={true} />

      {/* Header aligned with HomeTopBar & Android back button over edge-to-edge Wallpaper */}
      <View style={[styles.topBar, { paddingTop: Math.max(safeTop + 10, 20) }]}>
        <Pressable
          onPress={onBack ?? onComplete}
          hitSlop={12}
          style={({ pressed }) => [styles.topBackBtn, { opacity: pressed ? 0.72 : 1 }]}
        >
          <Papicons name="ArrowLeft" size={20} color="#FFFFFF" />
        </Pressable>

        {phase === "summary" ? (
          <View style={styles.topTitleRow}>
            <Papicons name="Grades" size={20} color="#FFFFFF" />
            <Typography variant="h4" weight="semibold" style={styles.topTitleText} numberOfLines={1}>
              Notes débloquées ({openedSession.length})
            </Typography>
          </View>
        ) : (
          <View style={styles.topTitleRow}>
            <Text style={styles.topEmoji}>{currentItem.subjectEmoji}</Text>
            <Typography variant="h4" weight="semibold" style={styles.topTitleText} numberOfLines={1}>
              {currentItem.subjectName}
            </Typography>
          </View>
        )}

        <View style={styles.topRightRow}>
          {items.length > 1 && phase !== "summary" && (
            <View style={styles.topGlassPill}>
              <Typography variant="caption" weight="semibold" style={{ color: "#FFFFFF" }}>
                {queueIndex + 1} / {items.length}
              </Typography>
            </View>
          )}
          <Pressable
            onPress={phase === "tapping" ? triggerReveal : onComplete}
            hitSlop={12}
            style={({ pressed }) => [styles.topGlassPill, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Typography variant="body2" weight="semibold" style={{ color: "#FFFFFF" }}>
              {phase === "tapping" ? "Passer" : "Fermer"}
            </Typography>
          </Pressable>
        </View>
      </View>

      {phase === "tapping" && (
        <Pressable style={styles.stageTapArea} onPress={handleIconTap}>
          <Animated.View style={[styles.rarityHeader, pillAnimStyle]}>
            <View
              style={[
                styles.rarityPill,
                {
                  backgroundColor: cardColor,
                  borderColor,
                },
              ]}
            >
              <Papicons name={activeConfig.iconName} size={16} color={activeConfig.color} />
              <Typography variant="title" weight="semibold" style={{ color: activeConfig.color }}>
                {activeConfig.label}
              </Typography>
            </View>
            {upgradedNotice && (
              <View style={[styles.upgradePill, { backgroundColor: activeConfig.color }]}>
                <Papicons name="ArrowUp" size={12} color="#FFFFFF" />
                <Text style={styles.upgradePillText}>{upgradedNotice}</Text>
              </View>
            )}
          </Animated.View>

          <View style={styles.iconCenterWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.rippleRing,
                { borderColor: activeConfig.color },
                ringAnimStyle,
              ]}
            />
            <Animated.View style={[styles.gachaIconHalo, { backgroundColor: `${activeConfig.color}1A` }, iconAnimStyle]}>
              <Papicons name={tapIconName} size={96} color={activeConfig.color} />
            </Animated.View>
          </View>

          <View style={[styles.bottomTapGuide, { paddingBottom: Math.max(safeBottom + 20, 32) }]}>
            <View style={styles.pipsRow}>
              {[0, 1, 2, 3].map(idx => {
                const filled = idx < tapStep;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pip,
                      {
                        backgroundColor: filled ? activeConfig.color : cardColor,
                        borderColor: filled ? activeConfig.color : borderColor,
                      },
                    ]}
                  />
                );
              })}
            </View>
            <Typography variant="title" weight="semibold" align="center">
              {tapPrompt}
            </Typography>
            <Typography variant="body2" color="textSecondary" numberOfLines={1} align="center">
              {currentItem.grade.description || currentItem.subjectName}
            </Typography>
          </View>
        </Pressable>
      )}

      {phase === "card" && (
        <View style={styles.revealStageWrapper}>
          <View style={styles.particlesCenter} pointerEvents="none">
            {particleSpecs.map((spec, idx) => (
              <GeometricParticle
                key={spec.id}
                spec={spec}
                active={phase === "card"}
                color={
                  idx % 3 === 0
                    ? activeConfig.color
                    : idx % 3 === 1
                      ? adjust(activeConfig.color, theme.dark ? 0.3 : -0.25)
                      : String(colors.primary)
                }
              />
            ))}
          </View>

          <ScrollView
            style={styles.revealScroll}
            contentContainerStyle={[
              styles.revealScrollContent,
              { paddingBottom: Math.max(safeBottom + 24, 34) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.revealHero, revealAnimStyle]}>
              {/* Papillon card + ModalOverhead-style score header */}
              <View style={[styles.overheadBlock, { backgroundColor: itemColor }]}>
                <View style={styles.overheadPillRow}>
                  <View
                    style={[
                      styles.rarityPill,
                      { backgroundColor: surfaceBg, borderColor },
                    ]}
                  >
                    <Papicons name={activeConfig.iconName} size={15} color={activeConfig.color} />
                    <Typography variant="body2" weight="semibold" style={{ color: activeConfig.color }}>
                      {activeConfig.label}
                    </Typography>
                  </View>
                  <View style={[styles.dropBadge, { backgroundColor: surfaceBg, borderColor }]}>
                    <Typography variant="caption" color="textSecondary" weight="semibold">
                      #{baseDropNumber + queueIndex}
                    </Typography>
                  </View>
                </View>

                <View style={styles.scoreHeroRow}>
                  <Text style={[styles.scoreHeroValue, { color: activeConfig.color }]}>
                    {rollingText}
                  </Text>
                  {formattedScore.denominator !== "" && (
                    <Typography variant="h4" color="textSecondary" style={{ marginBottom: 8 }}>
                      {formattedScore.denominator}
                    </Typography>
                  )}
                </View>

                <Typography variant="h4" weight="semibold" align="center">
                  {currentItem.subjectEmoji} {currentItem.subjectName}
                </Typography>
                <Typography variant="body1" color="textSecondary" align="center" numberOfLines={2}>
                  {currentItem.grade.description || "Nouvelle évaluation"}
                </Typography>
              </View>

              {/* Native Papillon grouped List-row section */}
              <View style={styles.groupedRowsBlock}>
                {cardDetailRows.map((row, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === cardDetailRows.length - 1;
                  const rowTint = row.tint ?? String(colors.text);
                  return (
                    <View
                      key={row.key}
                      style={[
                        styles.groupedRow,
                        {
                          backgroundColor: itemColor,
                          borderTopLeftRadius: isFirst ? 20 : 8,
                          borderTopRightRadius: isFirst ? 20 : 8,
                          borderBottomLeftRadius: isLast ? 20 : 8,
                          borderBottomRightRadius: isLast ? 20 : 8,
                          marginBottom: !isLast && Platform.OS === "android" ? 4 : 0,
                          borderBottomWidth: !isLast && Platform.OS === "ios" ? StyleSheet.hairlineWidth : 0,
                          borderBottomColor: borderColor,
                        },
                      ]}
                    >
                      <Papicons name={row.icon} size={20} color={rowTint} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Typography variant="title" weight="semibold" numberOfLines={2}>
                          {row.title}
                        </Typography>
                        {row.subtitle && (
                          <Typography variant="subtitle" color="textSecondary">
                            {row.subtitle}
                          </Typography>
                        )}
                      </View>
                      {row.trailing && (
                        <Typography variant="title" weight="semibold" color="textSecondary">
                          {row.trailing}
                        </Typography>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Native Papillon Button actions */}
              <View style={styles.cardActionsBlock}>
                {remainingCount > 0 ? (
                  <>
                    <Button
                      variant="primary"
                      color="primary"
                      size="large"
                      title={`Note suivante (${remainingCount} restante${remainingCount > 1 ? "s" : ""})`}
                      icon={<Papicons name="ArrowRight" size={18} color="#FFFFFF" />}
                      onPress={handleNextInQueue}
                      style={{ width: "100%" }}
                    />
                    {openedSession.length > 1 ? (
                      <Button
                        variant="ghost"
                        color="text"
                        title={`Voir le récapitulatif (${openedSession.length})`}
                        icon={<Papicons name="Pie" size={16} color={String(colors.text)} />}
                        onPress={() => setPhase("summary")}
                      />
                    ) : (
                      <Button
                        variant="ghost"
                        color="text"
                        title="Voir juste cette note"
                        onPress={finishAndClose}
                      />
                    )}
                  </>
                ) : openedSession.length > 1 ? (
                  <>
                    <Button
                      variant="primary"
                      color="primary"
                      size="large"
                      title={`Voir toutes les notes ouvertes (${openedSession.length})`}
                      icon={<Papicons name="Grid" size={18} color="#FFFFFF" />}
                      onPress={() => setPhase("summary")}
                      style={{ width: "100%" }}
                    />
                    <Button
                      variant="ghost"
                      color="text"
                      title="Fermer"
                      onPress={finishAndClose}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      color="primary"
                      size="large"
                      title="Voir les détails"
                      onPress={finishAndClose}
                      style={{ width: "100%" }}
                    />
                    <Button
                      variant="ghost"
                      color="text"
                      title="Rejouer l'ouverture"
                      icon={<Papicons name="Sparkles" size={16} color={String(colors.text)} />}
                      onPress={handleReplaySingle}
                    />
                  </>
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </View>
      )}

      {phase === "summary" && (
        <View style={styles.summaryContainer}>
          {/* Same List + CompactGrade + Section layout as the Grades tab */}
          <List
            style={{ flex: 1 }}
            safeHorizontalPadding={16}
            ListHeaderComponent={
              <View style={{ paddingVertical: 14, gap: 16 }}>
                {summaryRarityCounts.length > 0 && (
                  <SafeHorizontalView base={16}>
                    <View style={styles.summaryPillsRow}>
                      {summaryRarityCounts.map(({ config, count }) => (
                        <View
                          key={config.tier}
                          style={[
                            styles.summaryRarityPill,
                            { backgroundColor: cardColor, borderColor },
                          ]}
                        >
                          <Papicons name={config.iconName} size={13} color={config.color} />
                          <Typography variant="caption" weight="semibold" style={{ color: config.color }}>
                            {config.label} x{count}
                          </Typography>
                        </View>
                      ))}
                    </View>
                  </SafeHorizontalView>
                )}

                <FlatList
                  data={openedSession}
                  keyExtractor={entry => entry.item.grade.id}
                  renderItem={({ item: entry }) => (
                    <Pressable
                      onPress={() => {
                        if (onSelectGrade) {
                          onSelectGrade(entry.item.grade.id);
                        } else {
                          onComplete();
                        }
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    >
                      <CompactGrade
                        grade={entry.item.grade}
                        subject={entry.item.subject}
                      />
                    </Pressable>
                  )}
                  showsHorizontalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                  horizontal
                  ListHeaderComponent={<SafeAreaView edges={{ left: SAFE_HORIZONTAL_EDGES.left }} style={{ paddingLeft: 16 }} />}
                  ListFooterComponent={<SafeAreaView edges={{ right: SAFE_HORIZONTAL_EDGES.right }} style={{ paddingRight: 16 }} />}
                  contentContainerStyle={{ paddingVertical: 8, overflow: "visible" }}
                  style={{ overflow: "visible", marginVertical: -8 }}
                />
              </View>
            }
          >
            {groupedSummary.map(group => (
              <List.Section key={group.subjectId} id={`gacha-summary-${group.subjectId}`}>
                <List.SectionTitle id={`gacha-summary-title-${group.subjectId}`}>
                  <View style={styles.summarySectionHeader}>
                    <Typography variant="h4">{group.subjectEmoji}</Typography>
                    <Typography style={{ flex: 1 }} variant="title" numberOfLines={1} weight="semibold" color="textPrimary">
                      {group.subjectName}
                    </Typography>
                  </View>
                </List.SectionTitle>

                {group.entries.map(entry => {
                  const cfg = entry.evaluation.config;
                  const dateLabel = entry.item.grade.givenAt
                    ? new Date(entry.item.grade.givenAt).toLocaleDateString(i18n.language, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : undefined;

                  return (
                    <List.Item
                      key={entry.item.grade.id}
                      id={`gacha-item-${entry.item.grade.id}`}
                      onPress={() => {
                        if (onSelectGrade) {
                          onSelectGrade(entry.item.grade.id);
                        } else {
                          onComplete();
                        }
                      }}
                    >
                      <View style={{ flex: 1, flexDirection: "column", gap: 2 }}>
                        <Typography numberOfLines={1} weight="semibold" variant="title">
                          {entry.item.grade.description || entry.item.subjectName}
                        </Typography>
                        <View style={styles.summaryRowMeta}>
                          <Papicons name={cfg.iconName} size={13} color={cfg.color} />
                          <Typography variant="subtitle" weight="semibold" style={{ color: cfg.color }}>
                            {cfg.label}
                          </Typography>
                          {dateLabel && (
                            <Typography numberOfLines={1} variant="subtitle" color="textSecondary" style={{ flexShrink: 1 }}>
                              · {dateLabel}
                            </Typography>
                          )}
                        </View>
                      </View>

                      <List.Trailing>
                        <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 1 }}>
                          <Typography weight="semibold" variant="h4">
                            {entry.scoreValue}
                          </Typography>
                          {entry.scoreDenominator !== "" && (
                            <Typography variant="subtitle" color="textSecondary">
                              {entry.scoreDenominator}
                            </Typography>
                          )}
                        </View>
                      </List.Trailing>
                    </List.Item>
                  );
                })}
              </List.Section>
            ))}
          </List>

          <View
            style={[
              styles.summaryFooter,
              { paddingBottom: Math.max(safeBottom + 14, 24) },
            ]}
          >
            <Button
              variant="primary"
              color="primary"
              size="large"
              title="Terminer"
              onPress={onComplete}
              style={{ width: "100%" }}
            />
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
    gap: 10,
  },
  topTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  topEmoji: {
    fontSize: 20,
  },
  topTitleText: {
    color: "#FFFFFF",
    flexShrink: 1,
  },
  topRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topGlassPill: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  topBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  stageTapArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  rarityHeader: {
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  rarityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  upgradePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  upgradePillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  iconCenterWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 220,
    height: 220,
  },
  gachaIconHalo: {
    width: 156,
    height: 156,
    borderRadius: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  rippleRing: {
    position: "absolute",
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 2.5,
  },
  bottomTapGuide: {
    alignItems: "center",
    gap: 10,
  },
  pipsRow: {
    flexDirection: "row",
    gap: 8,
  },
  pip: {
    width: 28,
    height: 7,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  revealStageWrapper: {
    flex: 1,
  },
  particlesCenter: {
    position: "absolute",
    left: "50%",
    top: "26%",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  particle: {
    position: "absolute",
  },
  revealScroll: {
    flex: 1,
  },
  revealScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  revealHero: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: 20,
  },
  overheadBlock: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 24,
  },
  overheadPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dropBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreHeroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    marginTop: 4,
  },
  scoreHeroValue: {
    fontSize: 54,
    fontWeight: "700",
    letterSpacing: -1,
  },
  groupedRowsBlock: {
    width: "100%",
  },
  groupedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  cardActionsBlock: {
    width: "100%",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  summaryContainer: {
    flex: 1,
  },
  summaryPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryRarityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summarySectionHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  summaryRowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  summaryFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
});
