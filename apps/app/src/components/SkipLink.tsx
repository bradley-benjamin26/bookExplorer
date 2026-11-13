import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { focusSkipTarget, skipTargetId } from "../skipLink";
import { useThemedStyles, type Theme } from "../theme";

/** Keyboard-only link shown on focus; moves focus to the matching SkipTarget after a long list. Web only. */
export function SkipLink({ name, label }: { name: string; label: string }) {
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  if (Platform.OS !== "web") return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => focusSkipTarget(skipTargetId(name), document)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={focused ? styles.shown : styles.hidden}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

/** Invisible, focusable landing spot placed right after a list. */
export function SkipTarget({ name }: { name: string }) {
  if (Platform.OS !== "web") return null;
  // tabIndex is a web-only prop that RN's View types don't declare.
  const webProps = { tabIndex: -1 } as object;
  return <View nativeID={skipTargetId(name)} {...webProps} />;
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    hidden: { position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" },
    shown: {
      alignSelf: "flex-start",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginVertical: spacing.sm,
      borderWidth: 1,
      borderColor: colors.ink,
      borderRadius: radii.sm,
      outlineWidth: 3,
      outlineOffset: 2,
      outlineColor: colors.focus,
      outlineStyle: "solid",
    },
    text: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.ink },
  });
}
