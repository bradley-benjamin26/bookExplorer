import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

type Variant = "primary" | "pill";

/** Shared button styling so every screen's primary action (scan, view-as-graph,
 * save-to-library, ...) looks and feels the same, including visual feedback on
 * press — plain Pressables elsewhere in this app render identically whether or
 * not they're being touched. */
export function Button({
  children,
  onPress,
  variant = "primary",
  active = false,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  variant?: Variant;
  /** Pill variant only: toggled visual state, e.g. an item that's already saved. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        variant === "primary" ? styles.primary : styles.pill,
        active && styles.pillActive,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={variant === "primary" ? styles.primaryText : styles.pillText}>{children}</Text>
    </Pressable>
  );
}

function createStyles({ colors, radii, spacing }: Theme) {
  return StyleSheet.create({
    primary: {
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: "center",
    },
    primaryText: { color: colors.primaryText, fontSize: 15, fontWeight: "600" },
    pill: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      backgroundColor: colors.chipBackground,
    },
    pillActive: { backgroundColor: colors.pillActiveBackground },
    pillText: { fontSize: 14, fontWeight: "600", color: colors.text },
    pressed: { opacity: 0.6 },
  });
}
