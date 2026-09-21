import type { Edition } from "@book-explorer/shared";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { routes } from "../navigation";
import { useThemedStyles, type Theme } from "../theme";

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
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(routes.book(isbn))}
    >
      {content}
    </Pressable>
  );
}

export function EditionsSection({ editions, highlighted }: { editions: Edition[]; highlighted?: boolean }) {
  const styles = useThemedStyles(createStyles);
  if (editions.length === 0) return null;

  return (
    <View style={[styles.section, highlighted && styles.sectionHighlighted]}>
      <Text style={styles.sectionTitle}>Find Your Edition ({editions.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
        {editions.map((edition, i) => (
          <EditionCard key={`${edition.openLibraryEditionId || edition.isbn}-${i}`} edition={edition} />
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles({ colors, kicker, cardStyle }: Theme) {
  return StyleSheet.create({
    section: { marginTop: 28, width: "100%" },
    // Landed on from the "Editions" graph node (see the graph screen's
    // handleNodePress) — reuses the same yellow the app already uses for a
    // toggled-on pill button, rather than introducing a new highlight color
    // just for this one case.
    sectionHighlighted: {
      backgroundColor: colors.pillActiveBackground,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: 12,
      padding: 12,
      marginHorizontal: -12,
    },
    sectionTitle: { ...kicker, marginBottom: 12 },
    pressed: { opacity: 0.6 },
    carousel: { gap: 12, paddingRight: 4 },
    card: {
      width: 140,
      borderRadius: 12,
      padding: 10,
      backgroundColor: colors.background,
      ...cardStyle,
    },
    cover: { width: 120, height: 180, marginBottom: 8, borderRadius: 4, backgroundColor: colors.background },
    coverPlaceholder: {
      width: 120,
      height: 180,
      marginBottom: 8,
      borderRadius: 4,
      backgroundColor: colors.chipBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    coverPlaceholderText: { fontSize: 12, color: colors.textFaint, textAlign: "center" },
    format: { fontSize: 13, fontWeight: "600", color: colors.text, textTransform: "capitalize" },
    meta: { fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 16 },
  });
}
