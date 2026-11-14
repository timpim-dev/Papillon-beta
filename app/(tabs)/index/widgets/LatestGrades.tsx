import { Link } from "expo-router";
import React from "react";
import { FlatList, Pressable, View } from "react-native";

import { Grade, Subject } from "@/services/shared/grade";
import CompactGrade from "@/ui/new/CompactGrade";

export type LatestGradeItem = Grade & { subject: Subject };

interface LatestGradesWidgetProps {
  grades: LatestGradeItem[];
}

const LatestGradesWidget = React.memo(({ grades }: LatestGradesWidgetProps) => {
  if (grades.length === 0) {
    return null;
  }

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={grades.slice(0, 5)}
      keyExtractor={item => item.id}
      ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
      contentContainerStyle={{
        paddingHorizontal: 10,
        paddingBottom: 12,
        paddingTop: 2,
      }}
      style={{ width: "100%" }}
      renderItem={({ item }) => (
        <Link
          href={{ pathname: "/(tabs)/grades/[id]", params: { id: item.id } }}
          asChild
        >
          <Pressable>
            <CompactGrade grade={item} subject={item.subject} />
          </Pressable>
        </Link>
      )}
    />
  );
});

LatestGradesWidget.displayName = "LatestGradesWidget";

export default LatestGradesWidget;
