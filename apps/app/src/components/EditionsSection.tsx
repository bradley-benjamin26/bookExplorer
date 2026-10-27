import type { Edition } from "@book-explorer/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { collapseSelfPublished } from "../editions";
import { routes } from "../navigation";
import { useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

function EditionCard({ edition }: { edition: Edition }) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const isbn = edition.isbn;

  const content = (
    <>
      {edition.coverUrl ? (
        <Image source={{ uri: edition.coverUrl }} style={styles.cover} resizeMode="contain" />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverPlaceholderText}>No cover</Text>
        </View>
      )}
      <Text style={styles.format} numberOfLines={1}>
        {edition.format ?? "Edition"}
      </Text>
      {edition.publisher && <Text style={styles.meta}>{edition.publisher}</Text>}
      {edition.publishDate && (
        <Text style={styles.meta} numberOfLines={1}>
          {edition.publishDate}
        </Text>
      )}
    </>
  );

  // An edition with no ISBN has nowhere to link to — the book detail screen
  // is keyed by ISBN, and this app has no edition-id-based route — so it's
  // shown as a plain, unpressable card instead of a dead link.
  if (!isbn) {
    return <View style={styles.card}>{content}</View>;
  }

  return (
    <Pressable
      ref={titleRef("View this edition")}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(routes.book(isbn))}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

export function EditionsSection({ editions, highlighted }: { editions: Edition[]; highlighted?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const [showAll, setShowAll] = useState(false);
  if (editions.length === 0) return null;

  const { shown, hiddenCount } = collapseSelfPublished(editions);
  const visible = showAll ? editions : shown;

  return (
    <View style={[styles.section, highlighted && styles.sectionHighlighted]}>
      <Text style={styles.sectionTitle} accessibilityRole="header">Find Your Edition ({editions.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
        {visible.map((edition, i) => (
          <EditionCard key={`${edition.openLibraryEditionId || edition.isbn}-${i}`} edition={edition} />
        ))}
        {hiddenCount > 0 && (
          <Pressable
            ref={titleRef(showAll ? "Show fewer editions" : "Show more editions")}
            style={({ pressed }) => [styles.moreCard, pressed && styles.pressed]}
            onPress={() => setShowAll((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAll }}
            accessibilityLabel={showAll ? "Show fewer independently published editions" : `View ${hiddenCount} more independently published editions`}
          >
            <Text style={styles.moreCount}>{showAll ? "Show fewer" : `+${hiddenCount}`}</Text>
            <Text style={styles.moreText}>
              {showAll ? "independently published" : "more independently published editions"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors, cardStyle, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    section: { marginTop: spacing.xxl, width: "100%" },
    // Landed on from the "Editions" graph node (see the graph screen's
    // handleNodePress) — reuses the same yellow the app already uses for a
    // toggled-on pill button, rather than introducing a new highlight color
    // just for this one case.
    sectionHighlighted: {
      backgroundColor: colors.pillActiveBackground,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: radii.sm,
      padding: spacing.md,
      marginHorizontal: -spacing.md,
    },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    pressed: { opacity: 0.6 },
    // Sized like an edition card so the carousel's rhythm doesn't break.
    moreCard: {
      width: 140,
      minHeight: 240,
      borderRadius: radii.sm,
      padding: 10,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.thread,
    },
    moreCount: { fontFamily: fonts.display, fontSize: typeScale.md, color: colors.cover },
    moreText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, textAlign: "center" },
    carousel: { gap: spacing.md, paddingRight: 4 },
    card: {
      width: 140,
      borderRadius: radii.sm,
      padding: 10,
      backgroundColor: colors.paper,
      ...cardStyle,
    },
    cover: { width: 120, height: 180, marginBottom: spacing.sm, borderRadius: 4, backgroundColor: colors.paper },
    coverPlaceholder: {
      width: 120,
      height: 180,
      marginBottom: spacing.sm,
      borderRadius: 4,
      backgroundColor: colors.chipBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    coverPlaceholderText: { fontSize: typeScale.xs, fontFamily: fonts.body, color: colors.inkFaint, textAlign: "center" },
    format: { fontSize: typeScale.xs, fontFamily: fonts.bodySemiBold, color: colors.ink, textTransform: "capitalize" },
    meta: { fontSize: typeScale.xs, fontFamily: fonts.body, color: colors.inkFaint, marginTop: 2, lineHeight: 16 },
  });
}
