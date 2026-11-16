import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  Platform,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";

/**
 * Tracks whether the virtual keyboard is currently open.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}

export interface KeyboardAvoidingContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  iosKeyboardVerticalOffset?: number;
  extraBottomSpacing?: number;
  enabled?: boolean;
}

/**
 * Keeps text inputs above the on-screen keyboard on both iOS and Android edge-to-edge layouts.
 * On Android, measures the container's bottom window coordinate against the IME top (`screenY`)
 * so nested headers and edge-to-edge insets never leave typebars partially covered or double-padded.
 */
export default function KeyboardAvoidingContainer({
  children,
  style,
  iosKeyboardVerticalOffset = 0,
  extraBottomSpacing = 6,
  enabled = true,
}: KeyboardAvoidingContainerProps) {
  const viewRef = useRef<{
    measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
  } | null>(null);
  const [androidPadding, setAndroidPadding] = useState(0);

  const updateAndroidPadding = useCallback(
    (event: KeyboardEvent | null) => {
      if (!enabled || !event) {
        setAndroidPadding(0);
        return;
      }

      const imeTop = event.endCoordinates.screenY;
      const imeHeight = event.endCoordinates.height;

      if (!viewRef.current?.measureInWindow) {
        setAndroidPadding(Math.max(0, imeHeight + extraBottomSpacing));
        return;
      }

      viewRef.current.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        if (h <= 0) {
          setAndroidPadding(Math.max(0, imeHeight + extraBottomSpacing));
          return;
        }
        const containerBottom = y + h;
        const overlap = containerBottom - imeTop;
        setAndroidPadding(overlap > 0 ? Math.ceil(overlap + extraBottomSpacing) : 0);
      });
    },
    [enabled, extraBottomSpacing]
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidShow", updateAndroidPadding);
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidPadding(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [updateAndroidPadding]);

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView
        style={style}
        behavior="padding"
        keyboardVerticalOffset={iosKeyboardVerticalOffset}
        enabled={enabled}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      ref={node => {
        viewRef.current = node as unknown as {
          measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
        } | null;
      }}
      collapsable={false}
      style={[style, enabled && androidPadding > 0 ? { paddingBottom: androidPadding } : null]}
    >
      {children}
    </View>
  );
}
