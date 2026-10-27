import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";
import { ExpandableText } from "./ExpandableText";

/** "About" with the description clamped behind "View more", then its source credit. */
export function AboutSection({ text, credit }: { text: string; credit?: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.aboutSection}>
      <Text style={styles.sectionTitle} accessibilityRole="header">About</Text>
      <ExpandableText text={text} textStyle={styles.description} viewMoreStyle={styles.viewMore} />
      {credit}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    aboutSection: { marginTop: spacing.xxl, width: "100%" },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    description: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24 },
    viewMore: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
  });
}
