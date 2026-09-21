import type { Rating } from "@book-explorer/shared";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

const SOURCE_LABELS: Record<Rating["sources"][number], string> = {
  hardcover: "Hardcover",
  openLibrary: "Open Library",
  googleBooks: "Google Books",
};

export function RatingBadge({ rating }: { rating: Rating | null }) {
  const styles = useThemedStyles(createStyles);
  if (!rating) return null;

  // More than one source means this is a blended average (see
  // combineRatings on the server) — labeled as such so "4.4 (3,812 ratings)"
  // doesn't read as coming from one single place when it's actually a
  // combined pool from more than one.
  const sourceLabel = rating.sources.map((s) => SOURCE_LABELS[s]).join(" + ");

  return (
    <View style={styles.row}>
      <Text style={styles.stars}>★ {rating.average.toFixed(1)}</Text>
      <Text style={styles.count}>
        ({rating.count.toLocaleString()} rating{rating.count === 1 ? "" : "s"} · {sourceLabel})
      </Text>
    </View>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 },
    stars: { fontSize: 15, fontWeight: "700", color: colors.warning },
    count: { fontSize: 12, color: colors.textMuted },
  });
}
