import { AlertTriangle } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { errorCopy } from "../errorCopy";
import { useTheme, useThemedStyles, type Theme } from "../theme";

/** The "couldn't load this" state every detail screen needs (a bad ISBN, an id that doesn't resolve, a network failure) — a plain wall of red text read as more alarming than informative, so this gives it a little visual weight without overstating what's usually just a not-found. */
export function ErrorState({ message, error, action }: { message: string; error?: unknown; action?: { label: string; onPress: () => void } }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><AlertTriangle size={28} color={theme.colors.danger} strokeWidth={2} opacity={0.7} /></View>
      <Text style={styles.message}>{errorCopy(message, error)}</Text>
      {action && <Button variant="primary" onPress={action.onPress}>{action.label}</Button>}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md, backgroundColor: colors.paper },
    message: { textAlign: "center", fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.danger, lineHeight: 24 },
  });
}
