import type { Review } from "@book-explorer/shared";
import { ChevronDown, ChevronUp, Star } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";

function ReviewCard({ review }: { review: Review }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  // A spoiler review starts hidden behind a tap — same "opt in, don't
  // ambush" reasoning as a spoiler tag on any other reading platform,
  // even though this app otherwise never hides content behind a press.
  const [revealed, setRevealed] = useState(!review.hasSpoilers);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.reviewer}>{review.reviewerName}</Text>
        {review.rating != null && (
          <View style={styles.ratingRow}>
            <Star size={12} color={theme.colors.warning} fill={theme.colors.warning} strokeWidth={2} />
            <Text style={styles.rating}>{review.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      {revealed ? (
        <Text style={styles.text}>{review.text}</Text>
      ) : (
        <Pressable onPress={() => setRevealed(true)} accessibilityRole="button">
          <Text style={styles.spoilerText}>Contains spoilers — tap to reveal</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ReviewsSection({ reviews }: { reviews: Review[] }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  if (reviews.length === 0) return null;

  return (
    <View style={styles.section}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Reviews (${reviews.length})`}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {open ? (
            <ChevronUp size={16} color={theme.colors.inkFaint} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} color={theme.colors.inkFaint} strokeWidth={2} />
          )}
        </View>
      </Pressable>
      {open && (
        <>
          {reviews.map((review, i) => (
            <ReviewCard key={i} review={review} />
          ))}
          <Text style={styles.attribution}>via Hardcover</Text>
        </>
      )}
    </View>
  );
}

function createStyles({ colors, cardStyle, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    section: { marginTop: spacing.xxl, width: "100%" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink },
    pressed: { opacity: 0.6 },
    card: {
      borderRadius: radii.sm,
      padding: 14,
      marginBottom: spacing.md,
      backgroundColor: colors.paper,
      ...cardStyle,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
    reviewer: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.ink },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    rating: { fontSize: typeScale.xs, fontFamily: fonts.bodySemiBold, color: colors.warning },
    text: { fontSize: 14, fontFamily: fonts.body, color: colors.ink, lineHeight: 22 },
    spoilerText: { fontSize: 14, fontFamily: fonts.body, color: colors.cover, fontStyle: "italic" },
    attribution: { fontSize: typeScale.xs, fontFamily: fonts.body, color: colors.inkFaint },
  });
}
