import { isValidIsbn } from "@book-explorer/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { searchBooks } from "../api/client";
import { routes } from "../navigation";
import { titleRef } from "../webTitle";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { IsbnScanButton } from "./IsbnScanButton";
import { WorkListRow } from "./WorkListRow";

// Same debounce and minimum as the search and connection screens.
const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;
const MAX_MATCHES = 6;

/**
 * The title/author/ISBN search field: an ISBN opens that book, anything else the search results.
 * With `graph`, it also lists matching works as you type (each opens its graph) and has an ISBN scan button.
 */
export function SearchBox({ style, graph }: { style?: StyleProp<ViewStyle>; graph?: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const matches = useQuery({
    queryKey: ["search", { q: debouncedQuery }],
    queryFn: () => searchBooks({ q: debouncedQuery }),
    enabled: !!graph && debouncedQuery.length >= MIN_QUERY_LENGTH,
  });
  const shown = query.trim() === debouncedQuery ? (matches.data ?? []).slice(0, MAX_MATCHES) : [];

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(isValidIsbn(trimmed) ? routes.book(trimmed) : routes.search(trimmed));
  };

  return (
    <View style={style}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Search by title, author, or ISBN"
          placeholderTextColor={theme.colors.inkFaint}
          accessibilityLabel="Search by title, author, or ISBN"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={submit}
        />
        {graph && <IsbnScanButton onScanned={setQuery} />}
        <Pressable
          ref={titleRef("Search")}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Search size={20} color={theme.colors.cover} />
        </Pressable>
      </View>
      {shown.length > 0 && (
        <View style={styles.dropdown} accessibilityLabel="Matching books">
          {shown.map((work) => (
            <WorkListRow
              key={work.openLibraryWorkId}
              work={work}
              onPress={() => {
                setQuery("");
                router.push(routes.graph("work", work.openLibraryWorkId));
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles({ colors, fonts, typeScale, spacing, radii }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.button,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
    },
    input: { flex: 1, fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, paddingVertical: spacing.md },
    pressed: { opacity: 0.6 },
    dropdown: { marginTop: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.card, overflow: "hidden" },
  });
}
