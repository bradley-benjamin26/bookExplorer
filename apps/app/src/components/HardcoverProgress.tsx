import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text } from "react-native";
import { fetchHardcoverProgress } from "../api/client";
import { getSessionToken } from "../hardcoverSession";
import { progressLabel } from "../hardcoverProgressLabel";
import { useThemedStyles, type Theme } from "../theme";

/** Shows the signed-in user's Hardcover reading state for a book (ISBN) or work (OL id). Renders nothing otherwise. */
export function HardcoverProgress({ type, id }: { type: "book" | "work"; id: string }) {
  const styles = useThemedStyles(createStyles);
  const { data } = useQuery({
    queryKey: ["hardcover", "progress", type, id],
    queryFn: () => fetchHardcoverProgress(type, id),
    enabled: !!getSessionToken(),
    staleTime: 5 * 60_000,
  });
  // Cached data can outlive the session, so check the token too.
  const label = data && getSessionToken() ? progressLabel(data) : null;
  if (!label) return null;
  return (
    <Text accessibilityRole="text" style={styles.text}>
      {label} on Hardcover
    </Text>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    text: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.xs },
  });
}
