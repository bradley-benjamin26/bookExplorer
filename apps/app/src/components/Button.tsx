import { Star } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityState, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { titleRef } from "../webTitle";
import { useTheme, useThemedStyles, type Theme } from "../theme";

/** "pill" is an outlined action (a soft rectangle); "chip" is the full-pill look, kept for real filters. */
type Variant = "primary" | "pill" | "chip";

/** Shared button styling so every screen's primary action (scan, view-as-graph,
 * save-to-library, ...) looks and feels the same, including visual feedback on
 * press — plain Pressables elsewhere in this app render identically whether or
 * not they're being touched. */
export function Button({
  children,
  onPress,
  variant = "primary",
  active = false,
  /** Pill and chip variants only: shows a star before the text, filled when `active`. For the save/unsave toggle. */
  starIcon = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  disabled = false,
  tooltip,
}: {
  children: ReactNode;
  onPress: () => void;
  variant?: Variant;
  /** Pill and chip variants only: toggled visual state, e.g. an item that's already saved. */
  active?: boolean;
  starIcon?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Extra state on top of selected/disabled, e.g. `expanded` for a show-more toggle. */
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  /** Hover text on web; no effect on native. */
  tooltip?: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const labelStyle = [variant === "primary" ? styles.primaryText : styles.pillText, active && styles.pillActiveText, textStyle];
  const starColor = active ? theme.colors.primaryText : theme.colors.ink;
  return (
    <Pressable
      ref={titleRef(tooltip)}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, ...(variant !== "primary" ? { selected: active, disabled } : { disabled }) }}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        variant === "primary" ? styles.primary : variant === "chip" ? styles.chip : styles.pill,
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
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: "center",
    },
    primaryText: { color: colors.primaryText, textAlign: "center", fontSize: typeScale.sm, fontFamily: fonts.bodySemiBold },
    pill: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radii.button,
      backgroundColor: colors.chipBackground,
      borderWidth: 1,
      borderColor: colors.pillBorder,
    },
    chip: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      backgroundColor: colors.chipBackground,
      borderWidth: 1,
      borderColor: colors.pillBorder,
    },
    pillActive: { backgroundColor: colors.pillActiveBackground, borderColor: colors.pillActiveBackground },
    pillActiveText: { color: colors.primaryText },
    starRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    pillText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.ink },
    pressed: { opacity: 0.6 },
    // Keyboard/external-switch focus ring (RN Web passes `focused` as a third
    // Pressable style-callback arg; native platforms ignore this since
    // `focused` stays false there).
    focused: { outlineWidth: 3, outlineOffset: 2, outlineColor: colors.focus, outlineStyle: "solid" },
  });
}
