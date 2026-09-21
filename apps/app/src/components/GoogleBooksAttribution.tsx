import { Image, Linking, Pressable, StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

const LOGO_URL = "https://books.google.com/googlebooks/images/poweredby.png";

/** Google Books' terms require this "powered by" credit wherever its content
 * (a cover image, a description) is used without further attribution of its
 * own. */
export function GoogleBooksAttribution({ label }: { label: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable style={styles.row} onPress={() => Linking.openURL("https://books.google.com")}>
      <Text style={styles.label}>{label}</Text>
      <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
    </Pressable>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    label: { fontSize: 12, color: colors.link },
    logo: { width: 100, height: 17 },
  });
}
