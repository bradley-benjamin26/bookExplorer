import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { searchBooks } from "../src/api/client";
import { WorkListRow } from "../src/components/WorkListRow";
import { routes } from "../src/navigation";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

// Waits for typing to pause before actually searching — Open Library is hit
// on every distinct query, so searching on every keystroke would fire a
// request per letter typed instead of once per word someone actually means
// to search for.
const DEBOUNCE_MS = 400;

// Open Library's own search endpoint rejects anything shorter than this —
// matched here so a still-short, mid-typing query never fires a doomed
// request in the first place, rather than relying only on the server's own
// short-circuit for it (see searchService.ts).
const MIN_QUERY_LENGTH = 3;

export default function Search() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState(q ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(q ?? "");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const isSearchable = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["search", trimmedQuery],
    queryFn: () => searchBooks(trimmedQuery),
    enabled: isSearchable,
  });

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={data ?? []}
      keyExtractor={(item) => item.openLibraryWorkId}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <TextInput
            style={styles.input}
            placeholder="Search by title or author"
            placeholderTextColor={theme.colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {trimmedQuery.length === 0 && (
            <Text style={styles.hint}>Search for a book by its title or author's name.</Text>
          )}
          {trimmedQuery.length > 0 && !isSearchable && (
            <Text style={styles.hint}>Keep typing — at least {MIN_QUERY_LENGTH} characters.</Text>
          )}
          {isSearchable && isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.link} />
            </View>
          )}
          {isSearchable && isError && (
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : "Something went wrong searching for that."}
            </Text>
          )}
          {isSearchable && !isLoading && !isError && data?.length === 0 && (
            <Text style={styles.hint}>No books found for "{trimmedQuery}".</Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <WorkListRow work={item} onPress={() => router.push(routes.work(item.openLibraryWorkId))} />
      )}
    />
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20 },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    hint: { fontSize: 14, color: colors.textFaint, fontStyle: "italic", marginTop: 16 },
    loadingRow: { marginTop: 20, alignItems: "center" },
    errorText: { fontSize: 14, color: colors.danger, marginTop: 16 },
  });
}
