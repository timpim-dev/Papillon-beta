import { Link } from "expo-router";
import React from "react";
import { View } from "react-native";

import { getHomeworkRouteId } from "@/database/useHomework";
import { Homework as SharedHomework } from "@/services/shared/homework";
import Task from "@/ui/components/Task";
import { getSubjectColor } from "@/utils/subjects/colors";
import { getSubjectEmoji } from "@/utils/subjects/emoji";
import { getSubjectName } from "@/utils/subjects/name";

interface TasksWidgetProps {
  tasks: SharedHomework[];
  onToggleTask: (task: SharedHomework) => void;
}

const TasksWidget = React.memo(({ tasks, onToggleTask }: TasksWidgetProps) => {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        width: "100%",
        paddingHorizontal: 10,
        paddingBottom: 10,
        gap: 8,
      }}
    >
      {tasks.slice(0, 3).map(item => {
        const id = getHomeworkRouteId(item);
        return (
          <Link
            key={id}
            href={{ pathname: "/(tabs)/tasks/[id]", params: { id } }}
            asChild
          >
            <Task
              subject={getSubjectName(item.subject)}
              emoji={getSubjectEmoji(item.subject)}
              title=""
              color={getSubjectColor(item.subject)}
              description={item.content}
              date={new Date(item.dueDate)}
              completed={item.isDone}
              hasAttachments={item.attachments.length > 0}
              isCustom={item.custom}
              onToggle={() => onToggleTask(item)}
            />
          </Link>
        );
      })}
    </View>
  );
});

TasksWidget.displayName = "TasksWidget";

export default TasksWidget;
