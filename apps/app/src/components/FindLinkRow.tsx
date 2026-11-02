import { ChevronRight } from "lucide-react-native";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

export function FindLinkRow({ label, url }: { label: string; url: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      ref={titleRef(label)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => Linking.openURL(url)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.text}>{label}</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ChevronRight size={18} color={theme.colors.inkFaint} />
      </View>
    </Pressable>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    // minHeight keeps the 44pt target.
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
    text: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.cover },
    pressed: { opacity: 0.6 },
  });
}
