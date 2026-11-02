import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type AccessibilityState } from "react-native";
import { rowFeedback } from "../rowFeedback";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

export interface PressableRowProps {
  /** Screen-reader label for the whole row (visible text goes in `children`). */
  label: string;
  /** Absent ⇒ the row renders disabled and never tints on hover. */
  onPress?: () => void;
  /** Hover text on web; no effect on native. */
  tooltip?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  children: ReactNode;
  /** Right-edge icon; the caller picks chevron (in-app) or external-link (off-app). */
  trailing?: ReactNode;
  /** Bottom hairline; default true. */
  divider?: boolean;
}

/** One full-width tappable row: ≥44pt, tinted press/hover, focus ring, optional trailing icon. */
export function PressableRow({
  label,
  onPress,
  tooltip,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  children,
  trailing,
  divider = true,
}: PressableRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      ref={titleRef(tooltip)}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: !onPress }}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.row,
        divider && styles.divider,
        onPress && rowFeedback(colors, { pressed, hovered }),
        focused && styles.focused,
      ]}
    >
      <View style={styles.body}>{children}</View>
      {trailing}
    </Pressable>
  );
}

function createStyles({ colors, radii, spacing }: Theme) {
  return StyleSheet.create({
    row: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: 12,
      // Same bleed as Phase A rows so the tint extends past the text.
      marginHorizontal: -spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
    },
    divider: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
    body: { flex: 1 },
    // RN Web passes `focused`; native ignores it.
    focused: { outlineWidth: 2, outlineColor: colors.cover, outlineStyle: "solid" },
  });
}
