import type { Rating } from "@book-explorer/shared";
import { Star } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";

const SOURCE_LABELS: Record<Rating["sources"][number], string> = {
  hardcover: "Hardcover",
  openLibrary: "Open Library",
  googleBooks: "Google Books",
};

export function RatingBadge({ rating }: { rating: Rating | null }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!rating) return null;

  // More than one source means this is a blended average (see
  // combineRatings on the server) — labeled as such so "4.4 (3,812 ratings)"
  // doesn't read as coming from one single place when it's actually a
  // combined pool from more than one.
  const sourceLabel = rating.sources.map((s) => SOURCE_LABELS[s]).join(" + ");

  return (
    <View style={styles.row}>
      <View style={styles.starRow}>
        <Star size={14} color={theme.colors.warning} fill={theme.colors.warning} strokeWidth={2} />
        <Text style={styles.stars}>{rating.average.toFixed(1)}</Text>
      </View>
      <Text style={styles.count}>
        ({rating.count.toLocaleString()} rating{rating.count === 1 ? "" : "s"} · {sourceLabel})
      </Text>
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.sm },
    starRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    stars: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.warning },
    count: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
  });
}
