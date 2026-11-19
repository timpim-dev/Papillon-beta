import { Papicons } from '@getpapillon/papicons';
import MaskedView from '@react-native-masked-view/masked-view';
import { type NativeStackNavigationProp, useNavigation, useRouter } from 'expo-router';
import { type ParamListBase, useIsFocused, useTheme } from 'expo-router/react-navigation';
import { notificationAsync, NotificationFeedbackType } from 'expo-haptics';
import { t } from 'i18next';
import React from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StatusBar, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Reanimated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getHomeworkRouteId,
  getWeekNumberFromDate,
  updateHomeworkIsDone,
  useHomeworkForWeeks,
} from '@/database/useHomework';
import { getManager } from '@/services/shared';
import { Homework as SharedHomework } from '@/services/shared/homework';
import { useAccountStore } from '@/stores/account';
import { getHomeWidgetsForAccount, useSettingsStore } from '@/stores/settings';
import { HomeWidgetId } from '@/stores/settings/types';
import { Dynamic } from '@/ui/components/Dynamic';
import Icon from '@/ui/components/Icon';
import MainTabErrorBoundary from '@/ui/components/MainTabErrorBoundary';
import Stack from '@/ui/components/Stack';
import Typography from '@/ui/components/Typography';
import { Animation } from '@/ui/utils/Animation';
import { cancelHomeworkReminder } from '@/utils/notifications/homeworkReminders';
import { checkConsent } from '@/utils/logger/consent';
import { warn } from '@/utils/logger/logger';

import { useGradesData } from '../grades/hooks/useGradesData';
import { usePeriodsData } from '../grades/hooks/usePeriodsData';
import HomeHeader from './atoms/HomeHeader';
import HomeTopBar from './atoms/HomeTopBar';
import Wallpaper from './atoms/Wallpaper';
import HomeWidget, { HomeWidgetItem } from './components/HomeWidget';
import { useHomeData } from './hooks/useHomeData';
import { useTimetableWidgetData } from './hooks/useTimetableWidgetData';
import { useTimetableWidgetTitle } from './hooks/useTimetableWidgetTitle';
import GradesWidget from './widgets/Grades';
import LatestGradesWidget, { LatestGradeItem } from './widgets/LatestGrades';
import TasksWidget from './widgets/Tasks';
import HomeTimeTableWidget from './widgets/timetable';

const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const bottomTabBarHeight = insets.bottom + 16;
  const topBarHeight = insets.top + 56 + (insets.right > 10 ? 10 : 0);
  const focused = useIsFocused();

  // Account
  const accounts = useAccountStore((state) => state.accounts);
  const lastUsedAccount = useAccountStore((state) => state.lastUsedAccount);
  const initializeTransport = useAccountStore((state) => state.initializeTransport);
  const account = accounts.find(a => a.id === lastUsedAccount);
  const router = useRouter();
  const personalization = useSettingsStore(state => state.personalization);
  const welcomeModalSeen = personalization.welcomeModalSeen;
  const mutateSettings = useSettingsStore(state => state.mutateProperty);

  React.useEffect(() => {
    if (accounts.length === 0) {
      router.replace("/(onboarding)/welcome");
      return;
    }

    if (account && account.transport === undefined) {
      initializeTransport(account.schoolName);
    }
  }, [account, accounts.length, router, initializeTransport]);

  // iOS refuses a modal during a transition: wait for the tabs to be on screen.
  const navigation = useNavigation();
  const [tabsAppeared, setTabsAppeared] = React.useState(false);

  React.useLayoutEffect(() => {
    let rootNavigation = navigation;
    while (!rootNavigation.getState()?.routes.some(route => route.name === "(tabs)")) {
      const parent = rootNavigation.getParent();
      if (!parent) {
        return;
      }
      rootNavigation = parent;
    }

    return (rootNavigation as NativeStackNavigationProp<ParamListBase>).addListener("transitionEnd", event => {
      if (!event.data.closing) {
        setTabsAppeared(true);
      }
    });
  }, [navigation]);

  const consentChecked = React.useRef(false);

  React.useEffect(() => {
    if (!focused || !tabsAppeared || !account) {
      return;
    }

    let cancelled = false;
    (async () => {
      if (!consentChecked.current) {
        const consent = await checkConsent();
        if (cancelled) {
          return;
        }
        consentChecked.current = true;
        if (!consent.given) {
          router.push("../consent");
          return;
        }
      }

      if (!welcomeModalSeen) {
        mutateSettings("personalization", { welcomeModalSeen: true });
        router.navigate("/(modals)/welcome");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [focused, tabsAppeared, account, welcomeModalSeen, mutateSettings, router]);

  const { syncing, refresh } = useHomeData();
  const { courses } = useTimetableWidgetData();
  const timetableTitle = useTimetableWidgetTitle(courses);

  const { currentPeriod, refresh: refreshPeriods } = usePeriodsData();
  const { subjects, grades, history, averages, refresh: refreshGrades } = useGradesData(currentPeriod);

  const serviceIds = React.useMemo(
    () => account?.services?.map(service => service.id) ?? [],
    [account?.services]
  );

  // Tasks widget data (current + next week)
  const currentWeek = getWeekNumberFromDate(new Date());
  const taskWeeks = React.useMemo(() => [currentWeek, currentWeek + 1], [currentWeek]);
  const [tasksRefresh, setTasksRefresh] = React.useState(0);
  const homeworkByWeek = useHomeworkForWeeks(taskWeeks, tasksRefresh);
  const wasFocusedRef = React.useRef(false);

  React.useEffect(() => {
    if (focused) {
      if (wasFocusedRef.current) {
        setTasksRefresh(prev => prev + 1);
      }
      wasFocusedRef.current = true;
    }
  }, [focused]);

  const upcomingTasks = React.useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const cutoff = startOfToday.getTime();
    const seen = new Set<string>();
    const collected: SharedHomework[] = [];

    for (const week of taskWeeks) {
      const list = homeworkByWeek[week] ?? [];
      for (const item of list) {
        const belongsToAccount = item.custom
          ? item.createdByAccount === account?.id
          : serviceIds.includes(item.createdByAccount);
        if (!belongsToAccount || item.isDone || new Date(item.dueDate).getTime() < cutoff) {
          continue;
        }
        const id = getHomeworkRouteId(item);
        if (!seen.has(id)) {
          seen.add(id);
          collected.push(item);
        }
      }
    }

    return collected.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [homeworkByWeek, taskWeeks, account?.id, serviceIds]);

  const handleToggleTask = React.useCallback(async (task: SharedHomework) => {
    const id = getHomeworkRouteId(task);
    const nextDone = !task.isDone;
    try {
      if (!task.custom) {
        const manager = getManager();
        await manager?.setHomeworkCompletion(task, nextDone);
      }
      await updateHomeworkIsDone(id, nextDone);
      setTasksRefresh(prev => prev + 1);
      if (nextDone) {
        notificationAsync(NotificationFeedbackType.Success);
        void cancelHomeworkReminder(id);
      }
    } catch (error) {
      warn(`Unable to toggle task from home widget: ${String(error)}`, "HomeScreen");
    }
  }, []);

  // Latest grades widget data
  const recentGrades = React.useMemo<LatestGradeItem[]>(() => {
    const flattened = subjects.flatMap(subject =>
      (subject.grades ?? []).map(grade => ({ ...grade, subject }))
    );
    return flattened
      .sort((a, b) => (b.givenAt?.getTime() ?? 0) - (a.givenAt?.getTime() ?? 0))
      .slice(0, 6);
  }, [subjects]);

  const [refreshing, setRefreshing] = React.useState(false);
  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      await refreshPeriods();
      await refreshGrades();
      const manager = getManager();
      if (manager) {
        await Promise.allSettled([
          ...taskWeeks.map(week => manager.getHomeworks(week)),
        ]);
      }
      setTasksRefresh(prev => prev + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshGrades, refreshPeriods, taskWeeks]);

  const gradesWidgetHidden = grades.length === 0;

  const renderTimeTable = React.useCallback(() => <HomeTimeTableWidget courses={courses} />, [courses]);
  const renderTasks = React.useCallback(
    () => <TasksWidget tasks={upcomingTasks} onToggleTask={handleToggleTask} />,
    [upcomingTasks, handleToggleTask]
  );
  const renderGrades = React.useCallback(
    () => <GradesWidget history={history} averages={averages} />,
    [history, averages]
  );
  const renderLatestGrades = React.useCallback(
    () => <LatestGradesWidget grades={recentGrades} />,
    [recentGrades]
  );

  const widgetRegistry = React.useMemo<Map<HomeWidgetId, HomeWidgetItem>>(
    () =>
      new Map<HomeWidgetId, HomeWidgetItem>([
        [
          "timetable",
          {
            id: "timetable",
            icon: <Papicons name={"Calendar"} />,
            title: timetableTitle,
            redirect: "(tabs)/calendar",
            hidden: courses.length === 0,
            render: renderTimeTable,
          },
        ],
        [
          "tasks",
          {
            id: "tasks",
            icon: <Papicons name={"tasks"} />,
            title: t("Home_Widget_NewHomeworks"),
            redirect: "(tabs)/tasks",
            hidden: upcomingTasks.length === 0,
            render: renderTasks,
          },
        ],
        [
          "grades_average",
          {
            id: "grades_average",
            icon: <Papicons name={"Grades"} />,
            title: t("Home_Widget_Grades_Average"),
            redirect: "(tabs)/grades",
            hidden: gradesWidgetHidden,
            render: renderGrades,
          },
        ],
        [
          "latest_grades",
          {
            id: "latest_grades",
            icon: <Papicons name={"Star"} />,
            title: t("Home_Widget_NewGrades"),
            redirect: "(tabs)/grades",
            hidden: recentGrades.length === 0,
            render: renderLatestGrades,
          },
        ],
      ]),
    [
      courses.length,
      gradesWidgetHidden,
      recentGrades.length,
      renderGrades,
      renderLatestGrades,
      renderTasks,
      renderTimeTable,
      timetableTitle,
      upcomingTasks.length,
    ]
  );

  const configuredWidgets = React.useMemo(
    () => getHomeWidgetsForAccount(personalization, lastUsedAccount),
    [personalization, lastUsedAccount]
  );

  const visibleWidgets = React.useMemo(
    () =>
      configuredWidgets
        .filter(config => config.enabled)
        .map(config => widgetRegistry.get(config.id))
        .filter((item): item is HomeWidgetItem => Boolean(item && !item.hidden && (!item.dev || __DEV__))),
    [configuredWidgets, widgetRegistry]
  );
  const allWidgetsHidden = visibleWidgets.length === 0;

  return (
    <>
      <Wallpaper />
      <HomeTopBar loading={syncing} />
      {focused && <StatusBar animated barStyle={'light-content'} />}
      <HomeViewContainer key={"home"}>
        <FlatList
          renderItem={({ item }) => (
            <Reanimated.View layout={Animation(LinearTransition, "list")}>
              <HomeWidget item={item} />
            </Reanimated.View>
          )}
          keyExtractor={(item, index) => item.id ?? `${item.title}-${index}`}
          ListHeaderComponent={<HomeHeader />}
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" progressViewOffset={topBarHeight} />}
          contentContainerStyle={{
            paddingBottom: Platform.OS === 'ios' ? bottomTabBarHeight : 16,
            flexGrow: 1,
            gap: 12,
            marginTop: 6,
            width: '100%',
            maxWidth: 700,
            marginHorizontal: 'auto',
            paddingHorizontal: 16,
          }}
          data={visibleWidgets}
          ListFooterComponent={
            <View style={{ gap: 12, alignItems: 'center', paddingBottom: 12 }}>
              {allWidgetsHidden && <HomeEmptyState />}
              <Pressable
                onPress={() => router.push("/(settings)/home_widgets")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: theme.dark ? theme.colors.card : "#FFFFFFCC",
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                })}
              >
                <Papicons name="Grid" size={16} color={String(theme.colors.text)} opacity={0.75} />
                <Typography variant="body2" color="text" style={{ opacity: 0.85 }}>
                  {t("Home_Widgets_Customize")}
                </Typography>
              </Pressable>
            </View>
          }
        />
      </HomeViewContainer>
    </>
  );
};

const HomeEmptyState = React.memo(() => (
  <Dynamic animated key="home-widgets:empty" style={{ width: "100%" }}>
    <Stack hAlign="center" vAlign="center" flex padding={[22, 16]} gap={2} style={{ width: "100%" }}>
      <Icon papicon opacity={0.5} size={32} style={{ marginBottom: 3 }}>
        <Papicons name={"Ghost"} />
      </Icon>
      <Typography variant="h4" color="text" align="center">
        {t("Home_Widgets_Empty_Title")}
      </Typography>
      <Typography variant="body2" color="secondary" align="center">
        {t("Home_Widgets_Empty_Description")}
      </Typography>
    </Stack>
  </Dynamic>
));
HomeEmptyState.displayName = "HomeEmptyState";

const HomeViewContainer = ({ children }: { children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();

  return (
    <MaskedView
      maskElement={
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
          <LinearGradient
            colors={['#ff000022', 'white']}
            locations={[0.5, 1]}
            style={{ height: insets.top + 68 }}
          />
          <View style={{ flex: 1, backgroundColor: 'white' }} />
        </View>
      }
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["left", "right"]}>
        {children}
      </SafeAreaView>
    </MaskedView>
  );
};

const HomeScreenWithBoundary = () => (
  <MainTabErrorBoundary>
    <HomeScreen />
  </MainTabErrorBoundary>
);

export default HomeScreenWithBoundary;
