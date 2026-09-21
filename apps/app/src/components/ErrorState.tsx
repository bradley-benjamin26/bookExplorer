import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

/** The "couldn't load this" state every detail screen needs (a bad ISBN, an id that doesn't resolve, a network failure) — a plain wall of red text read as more alarming than informative, so this gives it a little visual weight without overstating what's usually just a not-found. */
export function ErrorState({ message }: { message: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
    icon: { fontSize: 28, color: colors.danger, opacity: 0.7 },
    message: { textAlign: "center", fontSize: 16, color: colors.danger, lineHeight: 22 },
  });
}
