import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

/** The centred top every detail page shares: image, title, byline, then the actions side by side. */
export function DetailTop({ image, title, children, actions }: { image?: ReactNode; title: string; children?: ReactNode; actions: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.header}>
      {image}
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {children}
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    header: { alignItems: "center", width: "100%" },
    title: { fontFamily: fonts.display, fontSize: typeScale.lg, textAlign: "center", letterSpacing: -0.3, color: colors.ink },
    actions: { flexDirection: "row", flexWrap: "nowrap", justifyContent: "center", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  });
}
