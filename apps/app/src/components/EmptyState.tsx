import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";
import { ThreadMotif } from "./ThreadMotif";

/** A tinted card for an empty screen or section: the thread, what's missing, and an optional next step. */
export function EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.card}>
      <ThreadMotif />
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction && (
        <Button variant="pill" onPress={onAction} style={styles.action}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
}

function createStyles({ colors, fonts, typeScale, spacing, radii }: Theme) {
  return StyleSheet.create({
    card: { backgroundColor: colors.emptyBackground, borderRadius: radii.md, padding: spacing.lg, gap: spacing.md },
    message: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    action: { alignSelf: "flex-start" },
  });
}
