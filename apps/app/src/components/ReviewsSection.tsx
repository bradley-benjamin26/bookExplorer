import type { Review } from "@book-explorer/shared";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, useTheme, useThemedStyles, type Theme } from "../theme";

function ReviewCard({ review }: { review: Review }) {
  const styles = useThemedStyles(createStyles);
  // A spoiler review starts hidden behind a tap — same "opt in, don't
  // ambush" reasoning as a spoiler tag on any other reading platform,
  // even though this app otherwise never hides content behind a press.
  const [revealed, setRevealed] = useState(!review.hasSpoilers);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.reviewer}>{review.reviewerName}</Text>
        {review.rating != null && <Text style={styles.rating}>★ {review.rating.toFixed(1)}</Text>}
      </View>
      {revealed ? (
        <Text style={styles.text}>{review.text}</Text>
      ) : (
        <Pressable onPress={() => setRevealed(true)}>
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
        {open ? (
          <ChevronUp size={16} color={theme.colors.textFaint} strokeWidth={2} />
        ) : (
          <ChevronDown size={16} color={theme.colors.textFaint} strokeWidth={2} />
        )}
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

function createStyles({ colors, cardStyle }: Theme) {
  return StyleSheet.create({
    section: { marginTop: 28, width: "100%" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    sectionTitle: { fontSize: 16, fontFamily: fonts.display, color: colors.text },
    pressed: { opacity: 0.6 },
    card: {
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      backgroundColor: colors.background,
      ...cardStyle,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    reviewer: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.text },
    rating: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.warning },
    text: { fontSize: 14, fontFamily: fonts.body, color: colors.text, lineHeight: 20 },
    spoilerText: { fontSize: 14, fontFamily: fonts.body, color: colors.link, fontStyle: "italic" },
    attribution: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint },
  });
}
