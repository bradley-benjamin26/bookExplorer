import { isValidIsbn } from "@book-explorer/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, ScanBarcode, Search } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Image } from "expo-image";
import { FlatList, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { NODE_LABELS } from "../src/graphLabels";
import { routes } from "../src/navigation";
import { titleRef } from "../src/webTitle";
import { getRecent, recentHref, recentOfKind, type RecentItem } from "../src/storage/history";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";
import { CoverPlaceholder } from "../src/components/CoverPlaceholder";
import { FeedbackBanner } from "../src/components/FeedbackBanner";
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
const INTRO_NODES = [
  ["Book", "graphWork"],
  ["Author", "graphAuthor"],
  ["Subject", "graphSubject"],
  ["Genre", "graphGenre"],
] as const;

export default function Home() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState("");
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

  const submitSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(isValidIsbn(trimmed) ? routes.book(trimmed) : routes.search(trimmed));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Padding lives on an inner View: react-native-web's SafeAreaView overwrites its own padding with the (zero on desktop) safe-area insets. */}
      <View style={styles.inner}>
        <FeedbackBanner />
        {/* First visit only: a returning reader's own threaded recents take this place. */}
        {recent.length === 0 && (
          <View style={styles.intro}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.introThread}>
              <View style={styles.introLine} />
              {INTRO_NODES.map(([label, color]) => (
                <View key={label} style={styles.introStop}>
                  <View style={[styles.introNode, { backgroundColor: theme.colors[color] }]} />
                  <Text style={styles.introLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.introText}>
              Start with a book you love, then follow the thread to its author, subjects and genres.
            </Text>
          </View>
        )}

        {Platform.OS !== "web" && (
          <Pressable
            ref={titleRef("Scan a book's barcode")}
            onPress={() => router.push("/scan")}
            accessibilityRole="button"
            accessibilityLabel="Scan a book"
            style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
              styles.scanButton,
              pressed && styles.pressed,
              focused && styles.focused,
            ]}
          >
            <ScanBarcode size={22} color={theme.colors.primaryText} />
            <Text style={styles.scanText}>Scan a book</Text>
          </Pressable>
        )}

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

        {recent.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle} accessibilityRole="header">
              Recently looked at
            </Text>
            <View style={styles.filterRow}>
              {filters.map((f) => (
                <Button key={f.value} variant="pill" active={f.value === filter} onPress={() => setFilter(f.value)}>
                  {f.label}
                </Button>
              ))}
            </View>
            <FlatList
              data={shown}
              contentContainerStyle={{ flexGrow: 1 }}
              keyExtractor={(item) => `${item.kind}:${item.id}`}
              renderItem={({ item, index }) => (
                <Pressable
                  ref={titleRef(`Open ${item.title ?? item.id}`)}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.recentItem, rowFeedback(theme.colors, { pressed, hovered })]}
                  onPress={() => router.push(recentHref(item))}
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.title ? `${item.title}, ${item.subtitle ? `${item.subtitle}, ` : ""}${typeLabel(item)}` : item.id
                  }
                >
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.nodeColumn}>
                    {/* The thread joins this node to its neighbours, but starts and ends at the first and last. */}
                    {shown.length > 1 && (
                      <View style={[styles.threadLine, index === 0 && styles.threadFirst, index === shown.length - 1 && styles.threadLast]} />
                    )}
                    <View style={[styles.node, { backgroundColor: theme.colors[KIND_COLOR[item.kind]] }]} />
                  </View>
                  {item.kind === "book" && (
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.recentCover}>
                      {/* Under the image: Open Library serves a transparent 1x1 for an ISBN with no cover. */}
                      <CoverPlaceholder width={32} height={48} />
                      <Image source={{ uri: recentCoverUrl(item) ?? undefined }} contentFit="cover" style={StyleSheet.absoluteFill} />
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
              )}
              ListFooterComponent={<Footer />}
              ListFooterComponentStyle={{ marginTop: "auto" }}
            />
          </View>
        )}
        {recent.length === 0 && <Footer />}
      </View>
    </SafeAreaView>
  );
}

function createStyles({ colors, fonts, typeScale, spacing, radii }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    inner: { flex: 1, padding: spacing.lg },
    intro: { marginTop: spacing.md, gap: spacing.lg },
    introThread: { flexDirection: "row" },
    // Runs between the first and last node centres: four equal cells put those at 1/8 and 7/8.
    introLine: { position: "absolute", top: 6, left: "12.5%", right: "12.5%", height: 1, backgroundColor: colors.thread },
    introStop: { flex: 1, alignItems: "center", gap: spacing.xs },
    introNode: { width: 12, height: 12, borderRadius: 6 },
    introLabel: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
    introText: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, lineHeight: 28, color: colors.ink },
    pressed: { opacity: 0.6 },
    focused: { outlineWidth: 2, outlineColor: colors.cover, outlineStyle: "solid" },
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
      marginTop: spacing.xxl,
      borderBottomWidth: 1,
      borderBottomColor: colors.cover,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      color: colors.ink,
      paddingVertical: spacing.md,
    },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
    recentSection: { marginTop: spacing.xxl, flex: 1 },
    recentTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.sm },
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
