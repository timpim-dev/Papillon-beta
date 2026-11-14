import { Papicons } from "@getpapillon/papicons";
import { HeaderBackButton, useTheme } from "expo-router/react-navigation";
import { Stack as ExpoStack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { t } from "i18next";
import React, { useCallback, useRef, useState } from "react";

import { AndroidHeaderMenu } from "@/components/AndroidHeaderItems";
import { AudioHomeworkRecorder } from "@/components/homework/AudioHomeworkRecorder";
import ModalOverhead from "@/components/ModalOverhead";
import { deleteHomeworkFromDatabase, getHomeworkById, updateHomeworkIsDone } from "@/database/useHomework";
import { getManager } from "@/services/shared";
import { openAttachmentViewer } from "@/utils/attachments/attachmentViewer";
import { getHomeworkUploadMeta } from "@/utils/homework/uploadMeta";
import { cancelHomeworkReminder } from "@/utils/notifications/homeworkReminders";
import AnimatedPressable from "@/ui/components/AnimatedPressable";
import Icon from "@/ui/components/Icon";
import Stack from "@/ui/components/Stack";
import { NativeHeaderSide } from "@/ui/components/NativeHeader";
import { formatHTML } from "@/utils/format/html";
import { getAttachmentIcon } from "@/utils/news/getAttachmentIcon";
import { getSubjectColor } from "@/utils/subjects/colors";
import { getSubjectEmoji } from "@/utils/subjects/emoji";
import { getSubjectName } from "@/utils/subjects/name";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import List from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import { Homework, ReturnFormat } from "@/services/shared/homework";
import ActivityIndicator from "@/ui/components/ActivityIndicator";
import SafeHorizontalView from "@/ui/components/SafeHorizontalView";

const Task = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const colors = theme.colors;
  const [task, setTask] = useState<Homework>();
  const [loading, setLoading] = useState(true);
  const [isDone, setIsDone] = useState(false);
  const taskRef = useRef<Homework>(undefined);

  // Read on every focus rather than once: a custom task can be edited or
  // deleted from its modal while this screen sits underneath. Service tasks
  // cannot change from here, so they are not fetched again.
  useFocusEffect(
    useCallback(() => {
      if (taskRef.current && !taskRef.current.custom) {
        return;
      }

      let cancelled = false;
      getHomeworkById(id)
        .then(result => {
          if (cancelled) {
            return;
          }
          // Editing a custom task moves it to a new id, so this one is gone.
          if (!result && taskRef.current) {
            router.back();
            return;
          }
          const meta = result ? getHomeworkUploadMeta(result.id) : null;
          const enriched = result
            ? {
                ...result,
                canUpload: result.canUpload ?? meta?.canUpload,
                uploadedAttachment:
                  result.uploadedAttachment ?? meta?.uploadedAttachment,
                maxUploadSizeBytes:
                  result.maxUploadSizeBytes ?? meta?.maxUploadSizeBytes,
                pronoteAssignmentId:
                  result.pronoteAssignmentId ?? meta?.pronoteAssignmentId,
              }
            : undefined;
          taskRef.current = enriched;
          setTask(enriched);
          setIsDone(enriched?.isDone ?? false);
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [id, router])
  );

  const formatedTask = formatHTML(task?.content ?? "")

  const subjectInfo = {
    color: getSubjectColor(task?.subject ?? ""),
    emoji: getSubjectEmoji(task?.subject ?? ""),
    name: getSubjectName(task?.subject ?? "")
  }

  const setAsDone = async (done: boolean) => {
    if (!task) return;
    // A custom task has no service to sync its state with.
    if (!task.custom) {
      const manager = getManager();
      await manager?.setHomeworkCompletion(task, done);
    }

    await updateHomeworkIsDone(id, done);
    if (done) {
      void cancelHomeworkReminder(id);
    }
    setIsDone(done);
  }

  const editTask = () => {
    if (!task) {
      return;
    }
    router.push({
      pathname: "/(modals)/tasks/custom",
      params: {
        replacedId: id,
        subject: task.subject,
        date: String(new Date(task.dueDate).getTime()),
        description: task.content,
        done: isDone ? "1" : "0",
      },
    });
  };

  const deleteTask = async () => {
    await deleteHomeworkFromDatabase(id);
    router.back();
  };

  const insets = useSafeAreaInsets();
  const finalHeaderHeight = Platform.select({
    android: insets.top + 32,
    default: 0
  });

  if (loading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  }

  if (!task) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Typography variant="title">{t("Tab_Tasks")}</Typography></View>;
  }

  return (
    <>
      {Platform.OS === "android" && (
        <NativeHeaderSide side="Left">
          <HeaderBackButton onPress={() => router.back()} />
        </NativeHeaderSide>
      )}

      {task.custom && (Platform.OS === "android" ? (
        <ExpoStack.Toolbar placement="right" asChild>
          <AndroidHeaderMenu
            icon="Dots"
            accessibilityLabel={t("Task_Custom_Actions")}
            actions={[
              { id: "edit", title: t("Task_Custom_Edit"), papicon: "PenAlt" },
              { id: "delete", title: t("Task_Custom_Delete"), papicon: "Trash", attributes: { destructive: true } },
            ]}
            onPressAction={({ nativeEvent }) => {
              if (nativeEvent.event === "edit") {
                editTask();
              } else if (nativeEvent.event === "delete") {
                deleteTask();
              }
            }}
          />
        </ExpoStack.Toolbar>
      ) : (
        <ExpoStack.Toolbar placement="right">
          <ExpoStack.Toolbar.Menu>
            <ExpoStack.Toolbar.Icon sf="ellipsis" />
            <ExpoStack.Toolbar.Label>{t("Task_Custom_Actions")}</ExpoStack.Toolbar.Label>
            <ExpoStack.Toolbar.MenuAction icon="pencil" onPress={editTask}>
              {t("Task_Custom_Edit")}
            </ExpoStack.Toolbar.MenuAction>
            <ExpoStack.Toolbar.MenuAction icon="trash" destructive onPress={deleteTask}>
              {t("Task_Custom_Delete")}
            </ExpoStack.Toolbar.MenuAction>
          </ExpoStack.Toolbar.Menu>
        </ExpoStack.Toolbar>
      ))}

      {Platform.OS !== "android" && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.overground, zIndex: -10 }}>
        <LinearGradient
          colors={[subjectInfo.color, theme.colors.overground]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 300,
            width: "100%",
            zIndex: -9,
            opacity: 0.4,
          }}
        />
        </View>
      )}

      <List
        contentInsetAdjustmentBehavior="automatic"
        safeHorizontalPadding={16}
        ListHeaderComponent={
          <SafeHorizontalView base={16}>
            <ModalOverhead
              emoji={subjectInfo.emoji}
              subject={subjectInfo.name}
              subjectVariant="header"
              color={Platform.OS === "ios" ? subjectInfo.color : colors.primary}
              custom={task.custom}
              date={new Date(task.dueDate)}
              style={{
                marginVertical: 0,
                paddingTop: finalHeaderHeight,
              }}
            />
          </SafeHorizontalView>
        }
        style={{
          backgroundColor: "transparent",
        }}
        contentContainerStyle={{
          paddingVertical: 16,
        }}
      >
        <List.Section>
          <List.SectionTitle>
            <List.Label>{t("Modal_Task_Status")}</List.Label>
          </List.SectionTitle>

          <List.Item>
            <List.Leading>
              <AnimatedPressable onPress={() => setAsDone(!isDone)}>
                <Stack
                  backgroundColor={
                    isDone
                      ? Platform.OS === "ios"
                        ? subjectInfo.color
                        : theme.colors.primary
                      : theme.colors.card
                  }
                  card
                  radius={100}
                  width={28}
                  height={28}
                  vAlign="center"
                  hAlign="center"
                >
                  {isDone && <Papicons name="check" size={22} color="white" />}
                </Stack>
              </AnimatedPressable>
            </List.Leading>
            <Typography variant="title">
              {isDone ? t("Task_Done") : t("Task_Undone")}
            </Typography>
          </List.Item>
        </List.Section>

        <List.Section>
          <List.SectionTitle>
            <List.Label>{t("Modal_Task_Description")}</List.Label>
          </List.SectionTitle>

          <List.Item>
            <Typography>{formatedTask}</Typography>
          </List.Item>
        </List.Section>

        {(task.returnFormat === ReturnFormat.AUDIO_RECORDING ||
          task.returnFormat === ReturnFormat.FILE_UPLOAD ||
          task.canUpload ||
          Boolean(task.uploadedAttachment)) && (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <AudioHomeworkRecorder
              homework={task}
              accentColor={subjectInfo.color}
              onUpdated={updated => {
                taskRef.current = updated;
                setTask(updated);
              }}
            />
          </View>
        )}

        {task.attachments.length > 0 && (
          <List.Section>
            <List.SectionTitle>
              <List.Label>{t("Modal_Task_Attachments")}</List.Label>
            </List.SectionTitle>

            {task.attachments.map((attachment, idx) => (
              <List.Item
                key={`${attachment.url}-${idx}`}
                onPress={() => openAttachmentViewer(router, attachment)}
              >
                <List.Leading>
                  <Icon>
                    <Papicons name={getAttachmentIcon(attachment)} />
                  </Icon>
                </List.Leading>
                <Typography variant="title" numberOfLines={1}>
                  {attachment.name || attachment.url}
                </Typography>
                <Typography
                  variant="body1"
                  color="textSecondary"
                  numberOfLines={1}
                >
                  {attachment.url}
                </Typography>
              </List.Item>
            ))}
          </List.Section>
        )}
      </List>
    </>
  );
};
export default Task;
