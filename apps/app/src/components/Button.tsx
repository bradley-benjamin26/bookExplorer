import { Star } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";

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
  /** Pill variant only: shows a star before the text, filled when `active`. For the save/unsave toggle. */
  starIcon = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  variant?: Variant;
  /** Pill variant only: toggled visual state, e.g. an item that's already saved. */
  active?: boolean;
  starIcon?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const labelStyle = [variant === "primary" ? styles.primaryText : styles.pillText, textStyle];
  const starColor = active ? theme.colors.marginalia : theme.colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={variant === "pill" ? { selected: active, disabled } : { disabled }}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        variant === "primary" ? styles.primary : styles.pill,
        active && styles.pillActive,
        (pressed || disabled) && styles.pressed,
        focused && styles.focused,
        style,
      ]}
    >
      {starIcon ? (
        <View style={styles.starRow}>
          <Star size={14} color={starColor} strokeWidth={2} fill={active ? starColor : "transparent"} />
          <Text style={labelStyle}>{children}</Text>
        </View>
      ) : (
        <Text style={labelStyle}>{children}</Text>
      )}
    </Pressable>
  );
}

function createStyles({ colors, radii, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    primary: {
      backgroundColor: colors.cover,
      borderRadius: radii.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: "center",
    },
    primaryText: { color: colors.paper, fontSize: typeScale.sm, fontFamily: fonts.bodySemiBold },
    pill: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      backgroundColor: colors.chipBackground,
    },
    pillActive: { backgroundColor: colors.pillActiveBackground },
    starRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    pillText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.ink },
    pressed: { opacity: 0.6 },
    // Keyboard/external-switch focus ring (RN Web passes `focused` as a third
    // Pressable style-callback arg; native platforms ignore this since
    // `focused` stays false there).
    focused: { outlineWidth: 2, outlineColor: colors.cover, outlineStyle: "solid" },
  });
}
