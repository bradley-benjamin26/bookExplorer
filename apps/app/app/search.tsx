import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { searchBooks } from "../src/api/client";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { WorkListRow } from "../src/components/WorkListRow";
import { routes } from "../src/navigation";
import {
  DEFAULT_SEARCH_FILTERS,
  getSearchFilters,
  setSearchFilters,
  toSearchParams,
  type SearchFilterChoice,
  type SearchMode,
} from "../src/storage/searchFilters";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";
import { titleRef } from "../src/webTitle";

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

const MODES: { value: SearchMode; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "subject", label: "Subject" },
];

export default function Search() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState(q ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(q ?? "");

  const [filters, setFilters] = useState<SearchFilterChoice>(DEFAULT_SEARCH_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    getSearchFilters().then(setFilters);
  }, []);
  const updateFilters = (patch: Partial<SearchFilterChoice>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setSearchFilters(next).catch(() => {});
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const isSearchable = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const params = toSearchParams(trimmedQuery, filters);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["search", params],
    queryFn: () => searchBooks(params),
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
            placeholder={`Search by ${filters.mode}`}
            accessibilityLabel={`Search by ${filters.mode}`}
            placeholderTextColor={theme.colors.inkFaint}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          <Pressable
            ref={titleRef(filtersOpen ? "Hide search filters" : "Show search filters")}
            onPress={() => setFiltersOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            style={styles.filterToggle}
          >
            <Text style={styles.filterToggleText}>{filtersOpen ? "Hide filters" : "Filters"}</Text>
          </Pressable>
          {filtersOpen && (
            <View>
              <View style={styles.chipRow}>
                {MODES.map((m) => (
                  <Button
                    key={m.value}
                    variant="pill"
                    active={filters.mode === m.value}
                    onPress={() => updateFilters({ mode: m.value })}
                    accessibilityLabel={`Search by ${m.label.toLowerCase()}`}
                    style={styles.chip}
                  >
                    {m.label}
                  </Button>
                ))}
              </View>
              <View style={styles.chipRow}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="From year"
                  placeholderTextColor={theme.colors.inkFaint}
                  value={filters.yearFrom}
                  onChangeText={(t) => updateFilters({ yearFrom: t.replace(/\D/g, "").slice(0, 4) })}
                  keyboardType="number-pad"
                  accessibilityLabel="First published from year"
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="To year"
                  placeholderTextColor={theme.colors.inkFaint}
                  value={filters.yearTo}
                  onChangeText={(t) => updateFilters({ yearTo: t.replace(/\D/g, "").slice(0, 4) })}
                  keyboardType="number-pad"
                  accessibilityLabel="First published to year"
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Language (eng)"
                  placeholderTextColor={theme.colors.inkFaint}
                  value={filters.language}
                  onChangeText={(t) => updateFilters({ language: t.replace(/[^a-zA-Z]/g, "").slice(0, 3) })}
                  autoCapitalize="none"
                  accessibilityLabel="Language, three-letter code such as eng"
                />
              </View>
            </View>
          )}
          {trimmedQuery.length === 0 && (
            <Text style={styles.hint}>Search for a book by its title or author's name.</Text>
          )}
          {trimmedQuery.length > 0 && !isSearchable && (
            <Text style={styles.hint}>Keep typing — at least {MIN_QUERY_LENGTH} characters.</Text>
          )}
          {isSearchable && isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.cover} />
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
      ListFooterComponent={<Footer />}
      ListFooterComponentStyle={{ marginTop: "auto" }}
    />
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: typeScale.sm,
      fontFamily: fonts.body,
      color: colors.ink,
    },
    filterToggle: { alignSelf: "flex-start", paddingVertical: spacing.sm, marginTop: spacing.sm },
    filterToggleText: { fontSize: typeScale.xs, fontFamily: fonts.bodySemiBold, color: colors.ink },
    chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
    chip: { alignSelf: "auto" },
    smallInput: { flex: 1, minWidth: 0 },
    hint: { fontSize: typeScale.xs, fontFamily: fonts.body, color: colors.inkFaint, fontStyle: "italic", marginTop: spacing.lg },
    loadingRow: { marginTop: spacing.xl, alignItems: "center" },
    errorText: { fontSize: typeScale.xs, fontFamily: fonts.body, color: colors.danger, marginTop: spacing.lg },
  });
}
