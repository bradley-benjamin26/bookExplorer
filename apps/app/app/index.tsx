import { isValidIsbn } from "@book-explorer/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, ScanBarcode, Search } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Image } from "expo-image";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { confirmDestructive } from "../src/confirm";
import { NODE_LABELS } from "../src/graphLabels";
import { routes } from "../src/navigation";
import { titleRef } from "../src/webTitle";
import { clearRecent, getRecent, recentHref, recentOfKind, type RecentItem } from "../src/storage/history";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";
import { CoverPlaceholder } from "../src/components/CoverPlaceholder";
import { FeedbackBanner } from "../src/components/FeedbackBanner";
import { HomeThread } from "../src/components/HomeThread";
import { recentCoverUrl } from "../src/listCovers";
import { rowFeedback } from "../src/rowFeedback";

type RecentFilter = "all" | "books" | "authors" | "subjects";
const FILTERS: { value: RecentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "books", label: "Books" },
  { value: "authors", label: "Authors" },
  { value: "subjects", label: "Subjects" },
];
const typeLabel = (item: RecentItem) => NODE_LABELS[item.kind === "book" ? "work" : item.kind];
// The graph's node colors, so Home previews the same legend the graph uses.
const KIND_COLOR = { book: "graphWork", work: "graphWork", author: "graphAuthor", subject: "graphSubject" } as const;

export default function Home() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [filter, setFilter] = useState<RecentFilter>("all");

  useFocusEffect(
    useCallback(() => {
      getRecent().then(setRecent);
    }, [])
  );

  // A pill shows only when that kind is present; if the chosen kind empties, fall back to everything.
  const filters = FILTERS.filter((f) => f.value === "all" || recentOfKind(recent, f.value).length > 0);
  const shown = recentOfKind(recent, filters.some((f) => f.value === filter) ? filter : "all");

  const clearHistory = async () => {
    if (!(await confirmDestructive("Clear history?", "Remove everything from your recently viewed list? This can't be undone.", "Clear"))) return;
    await clearRecent();
    setRecent([]);
    setFilter("all");
  };

  const submitSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(isValidIsbn(trimmed) ? routes.book(trimmed) : routes.search(trimmed));
  };

  const renderRecent = (item: RecentItem, index: number) => (
    <Pressable
      key={`${item.kind}:${item.id}`}
      ref={titleRef(`Open ${item.title ?? item.id}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.recentItem, rowFeedback(theme.colors, { pressed, hovered })]}
      onPress={() => router.push(recentHref(item))}
      accessibilityRole="button"
      accessibilityLabel={item.title ? `${item.title}, ${item.subtitle ? `${item.subtitle}, ` : ""}${typeLabel(item)}` : item.id}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.nodeColumn}>
        {/* The thread joins this node to its neighbours, but starts and ends at the first and last. */}
        {shown.length > 1 && (
          <View style={[styles.threadLine, index === 0 && styles.threadFirst, index === shown.length - 1 && styles.threadLast]} />
        )}
        <View style={[styles.node, { backgroundColor: theme.colors[KIND_COLOR[item.kind]] }]} />
      </View>
      {(item.kind === "book" || item.kind === "work") && (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.recentCover}>
          {/* Under the image: Open Library serves a transparent 1x1 for an ISBN with no cover. */}
          <CoverPlaceholder width={32} height={48} />
          <Image
            // Decorative: null alt (the row names the book); also covers Open Library's 1x1 no-cover image.
            accessibilityLabel=""
            // Entries saved before covers were stored borrow one from the cached page data.
            source={{ uri: recentCoverUrl(item.coverUrl ? item : { ...item, coverUrl: queryClient.getQueryData<{ coverUrl: string | null }>([item.kind, item.id])?.coverUrl }) ?? undefined }}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
      <View style={styles.recentText}>
        <Text style={styles.recentItemText}>{item.title ?? item.id}</Text>
        <Text style={styles.recentAuthor}>
          {typeLabel(item)}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
        </Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ChevronRight size={18} color={theme.colors.inkFaint} />
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Find your next read</Text>
        <Text style={styles.heading} accessibilityRole="header">
          Every book has a thread.
        </Text>
        <Text style={styles.introText}>Start with a book you love. Follow its connections to authors, subjects, and your next discovery.</Text>

        <Pressable
          ref={titleRef("Scan a book's barcode")}
          onPress={() => router.push("/scan")}
          accessibilityRole="button"
          accessibilityLabel="Scan a book"
          style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [styles.scanButton, pressed && styles.pressed, focused && styles.focused]}
        >
          <ScanBarcode size={22} color={theme.colors.primaryText} />
          <Text style={styles.scanText}>Scan a book</Text>
        </Pressable>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title, author, or ISBN"
            placeholderTextColor={theme.colors.inkFaint}
            accessibilityLabel="Search by title, author, or ISBN"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={submitSearch}
          />
          <Pressable
            ref={titleRef("Search")}
            onPress={submitSearch}
            accessibilityRole="button"
            accessibilityLabel="Search"
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Search size={20} color={theme.colors.cover} />
          </Pressable>
        </View>

        <View style={styles.threadSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            See where a thread leads
          </Text>
          <Text style={styles.sectionIntro}>An author leads to a book, and a book to a subject you might follow next. Tap a stop to explore.</Text>
          <HomeThread />
        </View>

        {recent.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Recently looked at
            </Text>
            <View style={styles.filterRow}>
              {filters.map((f) => (
                <Button key={f.value} variant="chip" active={f.value === filter} onPress={() => setFilter(f.value)}>
                  {f.label}
                </Button>
              ))}
            </View>
            {shown.map(renderRecent)}
            <Button variant="pill" onPress={clearHistory} accessibilityLabel="Clear recently looked at history">
              Clear history
            </Button>
          </View>
        )}

        <FeedbackBanner />
        <Footer />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles({ colors, fonts, typeScale, spacing, radii }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    // Padding lives on the scroll content: react-native-web's SafeAreaView overwrites its own padding with the (zero on desktop) safe-area insets.
    inner: { flexGrow: 1, padding: spacing.lg },
    eyebrow: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.cover, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.md },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.xl, lineHeight: 38, letterSpacing: -0.5, color: colors.ink, marginTop: spacing.sm },
    introText: { fontFamily: fonts.body, fontSize: typeScale.sm, lineHeight: 26, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.lg },
    threadSection: { marginTop: spacing.xxl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
    sectionIntro: { fontFamily: fonts.body, fontSize: typeScale.xs, lineHeight: 22, color: colors.textMuted, marginBottom: spacing.sm },
    pressed: { opacity: 0.6 },
    focused: { outlineWidth: 3, outlineOffset: 2, outlineColor: colors.focus, outlineStyle: "solid" },
    scanButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingVertical: spacing.lg,
    },
    scanText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.primaryText },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.button,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      color: colors.ink,
      paddingVertical: spacing.md,
    },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
    recentSection: { marginTop: spacing.xxl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.sm },
    recentItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      marginHorizontal: -spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    nodeColumn: { width: 8, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
    // The row's own padding sits inside the column, so the line meets the next row's line edge to edge.
    threadLine: { position: "absolute", top: -spacing.md, bottom: -spacing.md, width: 1, backgroundColor: colors.thread },
    threadFirst: { top: "50%" },
    threadLast: { bottom: "50%" },
    node: { width: 8, height: 8, borderRadius: 4 },
    recentCover: { width: 32, height: 48, borderRadius: radii.xs, overflow: "hidden" },
    recentText: { flex: 1 },
    recentItemText: { fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    recentAuthor: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.xs },
  });
}
