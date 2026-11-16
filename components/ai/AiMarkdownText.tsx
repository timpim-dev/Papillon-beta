import { useTheme } from "expo-router/react-navigation";
import React, { useMemo } from "react";
import { Linking, Platform, Text, TextStyle, View } from "react-native";

import {
  MarkdownBlock,
  MarkdownInlineRun,
  parseMarkdownBlocks,
} from "@/utils/ai/markdownParser";
import { useFont } from "@/utils/theme/fonts";

function renderMarkdownRuns(
  runs: MarkdownInlineRun[],
  baseStyle: TextStyle,
  primaryColor: string,
  codeBg: string,
  fontFn: (weight: "regular" | "medium" | "semibold" | "bold") => string
) {
  return runs.map((run, idx) => {
    const decoration = run.href
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
          (run.italic || run.math) && !run.code && { fontStyle: "italic" },
          decoration && { textDecorationLine: decoration },
          run.code && {
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            backgroundColor: codeBg,
            fontSize: Math.max(12, ((baseStyle.fontSize as number) || 15) - 1.5),
          },
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
        {run.code ? ` ${run.text} ` : run.text}
      </Text>
    );
  });
}

export interface AiMarkdownTextProps {
  text: string;
  textColor?: string;
}

export default function AiMarkdownText({ text, textColor }: AiMarkdownTextProps) {
  const { colors } = useTheme();
  const font = useFont();
  const resolvedColor = textColor || String(colors.text);
  const codeBg = String(colors.text) + "14";

  const blocks: MarkdownBlock[] = useMemo(() => parseMarkdownBlocks(text), [text]);

  const baseStyle: TextStyle = useMemo(
    () => ({
      color: resolvedColor,
      fontSize: 15.5,
      lineHeight: 22,
      fontFamily: font("regular"),
    }),
    [font, resolvedColor]
  );

  if (blocks.length === 0) {
    return (
      <Text selectable style={baseStyle}>
        {text}
      </Text>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      {blocks.map((block, index) => {
        if (block.type === "rule") {
          return (
            <View
              key={index}
              style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }}
            />
          );
        }

        if (block.type === "code-block") {
          return (
            <View
              key={index}
              style={{
                backgroundColor: colors.background,
                borderRadius: 10,
                padding: 10,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 4,
              }}
            >
              {block.language && (
                <Text
                  style={{
                    color: String(colors.primary),
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                  }}
                >
                  {block.language}
                </Text>
              )}
              <Text
                selectable
                style={{
                  color: resolvedColor,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  fontSize: 12.5,
                  lineHeight: 18,
                }}
              >
                {block.code}
              </Text>
            </View>
          );
        }

        if (block.type === "math-block") {
          return (
            <View
              key={index}
              style={{
                backgroundColor: String(colors.primary) + "12",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderLeftWidth: 3,
                borderLeftColor: colors.primary,
              }}
            >
              <Text
                selectable
                style={{
                  color: resolvedColor,
                  fontSize: 15.5,
                  lineHeight: 22,
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                {block.text}
              </Text>
            </View>
          );
        }

        if (block.type === "heading") {
          const sizes = { 1: 19, 2: 17.5, 3: 16.5, 4: 15.5 } as const;
          const headingStyle: TextStyle = {
            ...baseStyle,
            fontSize: sizes[block.level],
            lineHeight: sizes[block.level] + 6,
            fontFamily: font("bold"),
            fontWeight: "700",
            marginTop: index > 0 ? 4 : 0,
          };
          return (
            <Text key={index} selectable style={headingStyle}>
              {renderMarkdownRuns(block.runs, headingStyle, String(colors.primary), codeBg, font)}
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
                paddingLeft: 10,
                paddingVertical: 2,
                opacity: 0.92,
              }}
            >
              <Text selectable style={baseStyle}>
                {renderMarkdownRuns(block.runs, baseStyle, String(colors.primary), codeBg, font)}
              </Text>
            </View>
          );
        }

        if (block.type === "list-item") {
          return (
            <View
              key={index}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 7,
                paddingLeft: 2 + block.indent * 12,
              }}
            >
              <Text style={[baseStyle, { color: String(colors.primary), fontWeight: "700" }]}>
                {block.ordered ? `${block.index}.` : "•"}
              </Text>
              <Text selectable style={[baseStyle, { flex: 1 }]}>
                {renderMarkdownRuns(block.runs, baseStyle, String(colors.primary), codeBg, font)}
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
                gap: 6,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: block.header
                  ? String(colors.primary) + "16"
                  : colors.background,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {block.cells.map((cellRuns, cellIdx) => {
                const cellStyle: TextStyle = block.header
                  ? { ...baseStyle, fontFamily: font("semibold"), fontWeight: "600", fontSize: 14 }
                  : { ...baseStyle, fontSize: 14 };
                return (
                  <Text key={cellIdx} selectable style={[cellStyle, { flex: 1 }]}>
                    {renderMarkdownRuns(cellRuns, cellStyle, String(colors.primary), codeBg, font)}
                  </Text>
                );
              })}
            </View>
          );
        }

        return (
          <Text key={index} selectable style={baseStyle}>
            {renderMarkdownRuns(block.runs, baseStyle, String(colors.primary), codeBg, font)}
          </Text>
        );
      })}
    </View>
  );
}
