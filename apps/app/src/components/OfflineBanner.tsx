import { StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

/** Shown above cached detail when the refresh failed, so stale data isn't mistaken for current. Renders nothing otherwise. */
export function OfflineBanner({ show, updatedAt }: { show: boolean; updatedAt: number }) {
  const styles = useThemedStyles(createStyles);
  if (!show) return null;
  return (
    <Text style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      Couldn't refresh. Showing the copy from {new Date(updatedAt).toLocaleString()}
    </Text>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    banner: {
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      color: colors.danger,
      backgroundColor: colors.dangerBackground,
      padding: spacing.sm,
      textAlign: "center",
    },
  });
}
