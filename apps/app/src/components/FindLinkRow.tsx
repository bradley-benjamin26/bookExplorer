import { ExternalLink } from "lucide-react-native";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { PressableRow } from "./PressableRow";

/** An off-app link row: the external-link icon, not a chevron, says it leaves the app. */
export function FindLinkRow({ label, url, tooltip }: { label: string; url: string; tooltip?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <PressableRow
      label={label}
      tooltip={tooltip ?? label}
      accessibilityHint="Opens in your browser"
      onPress={() => Linking.openURL(url)}
      trailing={<ExternalLinkIcon color={colors.inkFaint} />}
    >
      <Text style={styles.text}>{label}</Text>
    </PressableRow>
  );
}

/** Decorative; the row's label and hint carry the meaning. */
export function ExternalLinkIcon({ color }: { color: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ExternalLink size={18} color={color} strokeWidth={2} />
    </View>
  );
}

function createStyles({ fonts, colors, typeScale }: Theme) {
  return StyleSheet.create({
    text: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.cover },
  });
}
