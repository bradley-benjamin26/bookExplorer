import { isValidIsbn } from "@book-explorer/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, ScanBarcode, Search } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { Footer } from "../src/components/Footer";
import { routes } from "../src/navigation";
import { titleRef } from "../src/webTitle";
import { getRecentBooks, type RecentBook } from "../src/storage/history";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

export default function Home() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<RecentBook[]>([]);

  useFocusEffect(
    useCallback(() => {
      getRecentBooks().then(setRecent);
    }, [])
  );

  const submitSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(isValidIsbn(trimmed) ? routes.book(trimmed) : routes.search(trimmed));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Padding lives on an inner View: react-native-web's SafeAreaView overwrites its own padding with the (zero on desktop) safe-area insets. */}
      <View style={styles.inner}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title} accessibilityRole="header">
              Shelf Thread
            </Text>
            <Text style={styles.subtitle}>find your next read</Text>
            <Pressable
              ref={titleRef("Read about this project")}
              onPress={() => router.push(routes.about())}
              accessibilityRole="link"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.aboutLink}>About Shelf Thread</Text>
            </Pressable>
          </View>
        </View>

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
            <FlatList
              data={recent}
              contentContainerStyle={{ flexGrow: 1 }}
              keyExtractor={(item) => item.isbn}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.recentItem, pressed && styles.pressed]}
                  onPress={() => router.push(routes.book(item.isbn))}
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.title
                      ? item.authorNames.length > 0
                        ? `${item.title}, ${item.authorNames.join(", ")}`
                        : item.title
                      : item.isbn
                  }
                >
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={styles.node} />
                  </View>
                  <View style={styles.recentText}>
                    <Text style={styles.recentItemText}>{item.title ?? item.isbn}</Text>
                    {item.authorNames.length > 0 && (
                      <Text style={styles.recentAuthor}>{item.authorNames.join(", ")}</Text>
                    )}
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
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginTop: spacing.md,
      marginBottom: spacing.xxl,
    },
    title: { fontFamily: fonts.display, fontSize: typeScale.xl, color: colors.ink },
    subtitle: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.inkFaint, marginTop: spacing.xs },
    aboutLink: {
      fontFamily: fonts.body,
      fontSize: typeScale.xs,
      color: colors.cover,
      textDecorationLine: "underline",
      marginTop: spacing.sm,
    },
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
    recentSection: { marginTop: spacing.xxl, flex: 1 },
    recentTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.sm },
    recentItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    node: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.thread },
    recentText: { flex: 1 },
    recentItemText: { fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    recentAuthor: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.xs },
  });
}
