import { Image, Linking, Pressable, StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

const LOGO_URL = "https://books.google.com/googlebooks/images/poweredby.png";

/** Google Books' terms require this "powered by" credit wherever its content
 * (a cover image, a description) is used without further attribution of its
 * own. */
export function GoogleBooksAttribution({ label }: { label: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable ref={titleRef("Visit Google Books")} style={styles.row} accessibilityRole="link" onPress={() => Linking.openURL("https://books.google.com")}>
      <Text style={styles.label}>{label}</Text>
      <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
    </Pressable>
  );
}

function createStyles({ colors, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    label: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover },
    logo: { width: 100, height: 17 },
  });
}
