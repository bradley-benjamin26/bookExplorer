import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { fetchHardcoverProgress } from "../api/client";
import { getSessionToken } from "../hardcoverSession";
import { progressLabel, progressSpokenLabel } from "../hardcoverProgressLabel";
import { HardcoverLogo } from "./HardcoverLogo";
import { useThemedStyles, type Theme } from "../theme";

/** Shows the signed-in user's Hardcover reading state for a book (ISBN) or work (OL id). Renders nothing otherwise. */
export function HardcoverProgress({ type, id }: { type: "book" | "work"; id: string }) {
  const styles = useThemedStyles(createStyles);
  const { data } = useQuery({
    queryKey: ["hardcover", "progress", type, id],
    queryFn: () => fetchHardcoverProgress(type, id),
    enabled: !!getSessionToken(),
    staleTime: 5 * 60_000,
    retry: false, // decorative badge: a failing Hardcover shouldn't be hammered
  });
  // Cached data can outlive the session, so check the token too.
  const label = data && getSessionToken() ? progressLabel(data) : null;
  if (!label) return null;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={progressSpokenLabel(label)} style={styles.row}>
      <Text style={styles.text}>{label}</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <HardcoverLogo height={14} />
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
    text: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.ink },
  });
}
