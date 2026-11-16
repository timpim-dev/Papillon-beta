import { useTheme } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Linking, Platform, Pressable, Text, TextStyle, View } from "react-native";

import { openAttachmentViewer } from "@/utils/attachments/attachmentViewer";
import { NewsInlineRun, NewsRenderBlock, parseNewsHtmlToBlocks } from "@/utils/news/parseNewsHtml";
import { useFont } from "@/utils/theme/fonts";

function ScaledNewsImage({ src }: { src: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [ratio, setRatio] = useState<number>(16 / 10);

  useEffect(() => {
    let active = true;
    Image.getSize(
      src,
      (width, height) => {
        if (active && width > 0 && height > 0) {
          setRatio(Math.min(Math.max(width / height, 0.5), 3));
        }
      },
      () => {
        // Keep fallback aspect ratio when remote headers block Image.getSize
      }
    );
    return () => {
      active = false;
    };
  }, [src]);

  return (
    <Pressable
      onPress={() =>
        openAttachmentViewer(router, {
          name: "Image",
          url: src,
          type: 1,
        })
      }
      style={{
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Image
        source={{ uri: src }}
        resizeMode="contain"
        style={{ width: "100%", aspectRatio: ratio }}
      />
    </Pressable>
  );
}

function renderRuns(
  runs: NewsInlineRun[],
  baseStyle: TextStyle,
  primaryColor: string,
  fontFn: (weight: "regular" | "medium" | "semibold" | "bold") => string
) {
  return runs.map((run, idx) => {
    const decoration =
      run.underline || run.href
        ? run.strike
          ? ("underline line-through" as const)
          : ("underline" as const)
        : run.strike
          ? ("line-through" as const)
          : undefined;

    return (
      <Text
        key={idx}
        style={[
          baseStyle,
          run.bold && { fontFamily: fontFn("bold"), fontWeight: "700" },
          run.italic && { fontStyle: "italic" },
          decoration && { textDecorationLine: decoration },
          run.code && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
          run.href && { color: primaryColor },
        ]}
        onPress={
          run.href
            ? () => {
                void Linking.openURL(run.href!).catch(() => undefined);
              }
            : undefined
        }
      >
        {run.text}
      </Text>
    );
  });
}

export interface RichNewsContentProps {
  html: string;
  rawHtml?: string;
  compact?: boolean;
}

export default function RichNewsContent({
  html,
  rawHtml,
  compact = false,
}: RichNewsContentProps) {
  const { colors } = useTheme();
  const font = useFont();

  const blocks: NewsRenderBlock[] = useMemo(() => {
    const primary = parseNewsHtmlToBlocks(html);
    if (primary.length > 0) return primary;
    if (rawHtml && rawHtml !== html) {
      return parseNewsHtmlToBlocks(rawHtml);
    }
    return [];
  }, [html, rawHtml]);

  const baseBodyStyle: TextStyle = useMemo(
    () => ({
      fontSize: compact ? 14.5 : 16,
      lineHeight: compact ? 21 : 24,
      fontFamily: font("regular"),
      color: String(colors.text),
    }),
    [colors.text, compact, font]
  );

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: compact ? 6 : 12 }}>
      {blocks.map((block, index) => {
        if (block.type === "rule") {
          return (
            <View
              key={index}
              style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }}
            />
          );
        }

        if (block.type === "image") {
          return <ScaledNewsImage key={index} src={block.src} />;
        }

        if (block.type === "heading") {
          const sizes = { 1: 22, 2: 20, 3: 18, 4: 17 } as const;
          const headingStyle: TextStyle = {
            ...baseBodyStyle,
            fontSize: sizes[block.level],
            lineHeight: sizes[block.level] + 7,
            fontFamily: font("bold"),
            fontWeight: "700",
          };
          return (
            <Text key={index} selectable style={headingStyle}>
              {renderRuns(block.runs, headingStyle, String(colors.primary), font)}
            </Text>
          );
        }

        if (block.type === "quote") {
          return (
            <View
              key={index}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: colors.primary,
                paddingLeft: 12,
                paddingVertical: 4,
                backgroundColor: String(colors.text) + "0A",
                borderRadius: 6,
              }}
            >
              <Text selectable style={baseBodyStyle}>
                {renderRuns(block.runs, baseBodyStyle, String(colors.primary), font)}
              </Text>
            </View>
          );
        }

        if (block.type === "list-item") {
          return (
            <View key={index} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingLeft: 4 }}>
              <Text style={[baseBodyStyle, { color: String(colors.primary), fontWeight: "700" }]}>
                {block.ordered ? `${block.index}.` : "•"}
              </Text>
              <Text selectable style={[baseBodyStyle, { flex: 1 }]}>
                {renderRuns(block.runs, baseBodyStyle, String(colors.primary), font)}
              </Text>
            </View>
          );
        }

        if (block.type === "table-row") {
          return (
            <View
              key={index}
              style={{
                flexDirection: "row",
                gap: 8,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: block.header
                  ? String(colors.primary) + "14"
                  : String(colors.card),
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {block.cells.map((cellRuns, cellIdx) => {
                const cellStyle: TextStyle = block.header
                  ? { ...baseBodyStyle, fontFamily: font("semibold"), fontWeight: "600" }
                  : baseBodyStyle;
                return (
                  <Text key={cellIdx} selectable style={[cellStyle, { flex: 1 }]}>
                    {renderRuns(cellRuns, cellStyle, String(colors.primary), font)}
                  </Text>
                );
              })}
            </View>
          );
        }

        return (
          <Text key={index} selectable style={baseBodyStyle}>
            {renderRuns(block.runs, baseBodyStyle, String(colors.primary), font)}
          </Text>
        );
      })}
    </View>
  );
}
