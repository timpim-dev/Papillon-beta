import { Link } from "expo-router";
import { useTheme } from "expo-router/react-navigation";
import React from "react";
import { View } from "react-native";

import { News as SharedNews } from "@/services/shared/news";
import Avatar from "@/ui/components/Avatar";
import Stack from "@/ui/components/Stack";
import { ListTouchable } from "@/ui/new/List";
import Typography from "@/ui/new/Typography";
import { getProfileColorByName } from "@/utils/chats/colors";
import { getInitials } from "@/utils/chats/initials";
import { formatHTML } from "@/utils/format/html";

interface NewsWidgetProps {
  news: SharedNews[];
}

const NewsWidget = React.memo(({ news }: NewsWidgetProps) => {
  const { colors } = useTheme();

  if (news.length === 0) {
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
      {news.slice(0, 3).map(item => {
        const author = item.author || "";
        const preview = item.content ? formatHTML(item.content, true) : "";
        const dateLabel = item.createdAt
          ? new Date(item.createdAt).toLocaleDateString()
          : "";
        return (
          <Link
            key={item.id}
            href={{
              pathname: "/(features)/(news)/specific",
              params: { id: item.id },
            }}
            asChild
          >
            <ListTouchable>
              <Stack
                direction="horizontal"
                gap={10}
                vAlign="center"
                padding={[12, 10]}
                radius={16}
                backgroundColor={String(colors.text) + "08"}
              >
                <Avatar
                  size={36}
                  color={getProfileColorByName(author)}
                  initials={getInitials(author)}
                />
                <Stack flex gap={2}>
                  <Typography variant="title" numberOfLines={1}>
                    {item.title || author}
                  </Typography>
                  {preview.length > 0 && (
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      numberOfLines={2}
                    >
                      {preview}
                    </Typography>
                  )}
                  {(author.length > 0 || dateLabel.length > 0) && (
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      numberOfLines={1}
                    >
                      {[author, dateLabel].filter(Boolean).join(" · ")}
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </ListTouchable>
          </Link>
        );
      })}
    </View>
  );
});

NewsWidget.displayName = "NewsWidget";

export default NewsWidget;
