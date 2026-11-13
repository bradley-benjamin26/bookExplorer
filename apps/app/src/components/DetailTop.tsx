import type { ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

// Below this width the image stacks over the text; at or above it, the image sits beside it.
const SIDE_BY_SIDE_MIN_WIDTH = 560;

// Equal-width primary buttons: same basis, grow to fill, capped so they do not stretch on wide screens.
export const PRIMARY_ACTION_STYLE: ViewStyle = { flexGrow: 1, flexBasis: 0, maxWidth: 240, paddingHorizontal: 12, justifyContent: "center" };

/** The left-aligned top every detail page shares: image, title, byline, then the page's main destinations (`primaryActions`, e.g. View as graph),
 * then the actions in a row (save, share). */
export function DetailTop({
  image,
  title,
  accessibilityLabel,
  children,
  actions,
  primaryActions,
}: {
  image?: ReactNode;
  title: string;
  accessibilityLabel?: string;
  children?: ReactNode;
  actions: ReactNode;
  primaryActions?: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const sideBySide = useWindowDimensions().width >= SIDE_BY_SIDE_MIN_WIDTH;
  return (
    <View style={[styles.header, sideBySide && styles.headerWide]}>
      {image ? <View style={styles.image}>{image}</View> : null}
      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header" accessibilityLabel={accessibilityLabel}>{title}</Text>
        {children}
        {/* The page's main destination leads; save and share follow. */}
        {primaryActions ? <View style={styles.primaryActions}>{primaryActions}</View> : null}
        <View style={styles.actions}>{actions}</View>
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    header: { alignItems: "flex-start", width: "100%", gap: spacing.md },
    headerWide: { flexDirection: "row", gap: spacing.xl },
    image: { alignItems: "flex-start" },
    text: { flexShrink: 1, flexGrow: 1, alignItems: "flex-start", alignSelf: "stretch" },
    title: { fontFamily: fonts.display, fontSize: typeScale.lg, textAlign: "left", letterSpacing: -0.3, color: colors.ink },
    actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
    primaryActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },
  });
}
