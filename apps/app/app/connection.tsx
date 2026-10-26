import { useQuery } from "@tanstack/react-query";
import type { GraphNode, WorkRef } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchPath, searchBooks } from "../src/api/client";
import { Button } from "../src/components/Button";
import { WorkListRow } from "../src/components/WorkListRow";
import { NODE_LABELS, PATH_NOT_FOUND_MESSAGES, pathSteps } from "../src/graphLabels";
import { routes } from "../src/navigation";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

// Same debounce and minimum as the search screen, for the same reasons.
const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;
// Matches the server's 25 s path search budget.
const SEARCHING_MESSAGE = "Searching… this can take up to 25 seconds.";

export default function Connection() {
  const params = useLocalSearchParams<{ from: string; label?: string }>();
  const from = params.from;
  const label = params.label || "this item";
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [target, setTarget] = useState<WorkRef | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const search = useQuery({
    queryKey: ["search", { q: trimmedQuery }],
    queryFn: () => searchBooks({ q: trimmedQuery }),
    enabled: !target && trimmedQuery.length >= MIN_QUERY_LENGTH,
  });

  const to = target ? `work:${target.openLibraryWorkId}` : "";
  const path = useQuery({
    queryKey: ["path", from, to],
    queryFn: ({ signal }) => fetchPath(from, to, signal),
    enabled: !!from && !!to,
    // Each run is costly and tightly rate-limited server-side, so never repeat one on its own.
    retry: false,
    staleTime: Infinity,
  });

  // iOS VoiceOver ignores accessibilityLiveRegion (Android-only), so progress and the outcome are announced too.
  useEffect(() => {
    if (path.isFetching) AccessibilityInfo.announceForAccessibility(SEARCHING_MESSAGE);
  }, [path.isFetching]);
  // Keyed on the update time, not the data: a retry that times out again returns equal data, which keeps the same reference.
  useEffect(() => {
    if (!path.data) return;
    const { data } = path;
    AccessibilityInfo.announceForAccessibility(
      data.found
        ? `${data.paths.length === 1 ? "1 connection" : `${data.paths.length} connections`} found. Best match: ${data.paths[0].summary}`
        : PATH_NOT_FOUND_MESSAGES[data.reason]
    );
  }, [path.dataUpdatedAt]);

  const sep = (from ?? "").indexOf(":");
  const [fromType, fromId] = [from?.slice(0, sep), from?.slice(sep + 1)];

  if (!target) {
    return (
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={(search.data ?? []).filter((w) => `work:${w.openLibraryWorkId}` !== from)}
        keyExtractor={(item) => item.openLibraryWorkId}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text style={styles.heading} accessibilityRole="header">
              Connect {label} to…
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Search for a book"
              accessibilityLabel="Search for a book to connect to"
              placeholderTextColor={theme.colors.inkFaint}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            {search.isLoading && <ActivityIndicator style={styles.loading} color={theme.colors.cover} />}
            {search.isError && <Text style={styles.errorText}>{search.error.message}</Text>}
          </View>
        }
        renderItem={({ item }) => <WorkListRow work={item} onPress={() => setTarget(item)} />}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        {label} to {target.title}
      </Text>
      {path.isFetching && (
        <View style={styles.loading} accessibilityLabel={SEARCHING_MESSAGE} accessibilityLiveRegion="polite" accessible>
          <ActivityIndicator color={theme.colors.cover} />
          <Text style={styles.hint}>{SEARCHING_MESSAGE}</Text>
        </View>
      )}
      {!path.isFetching && path.isError && <Text style={styles.errorText} accessibilityLiveRegion="polite">{path.error.message}</Text>}
      {!path.isFetching && !path.isError && path.data && !path.data.found && (
        <Text style={styles.hint} accessibilityLiveRegion="polite">{PATH_NOT_FOUND_MESSAGES[path.data.reason]}</Text>
      )}
      {!path.isFetching && path.data && !path.data.found && path.data.reason === "timeout" && (
        <Button variant="primary" onPress={() => path.refetch()} style={styles.action} accessibilityLabel="Try the search again">
          Try Again
        </Button>
      )}
      {path.data?.found && (
        <View accessibilityLiveRegion="polite">
          {path.data.paths.map((found, i) => {
            const name = i === 0 ? "Best match" : `Connection ${i + 1}`;
            return (
              <View key={i} style={styles.chain}>
                <Text style={styles.pathTitle} accessibilityRole="header">
                  {name}: {found.summary}
                </Text>
                {pathSteps(found).map((step) => (
                  <View key={step.node.id} accessible accessibilityLabel={step.accessibilityLabel}>
                    {step.relation && (
                      <View style={styles.link}>
                        <View style={styles.linkLine} />
                        <Text style={styles.linkText}>{step.relation}</Text>
                      </View>
                    )}
                    <View style={styles.node}>
                      <Text style={styles.nodeType}>{NODE_LABELS[step.node.type]}</Text>
                      <Text style={styles.nodeLabel}>{step.node.label}</Text>
                    </View>
                  </View>
                ))}
                <Button
                  variant={i === 0 ? "primary" : "pill"}
                  onPress={() => router.push(routes.graph(fromType as GraphNode["type"], fromId, { pathTo: to, pathIndex: String(i) }))}
                  style={styles.action}
                  accessibilityLabel={`Show ${name.toLowerCase()} on the graph`}
                >
                  Show on Graph
                </Button>
              </View>
            );
          })}
        </View>
      )}
      <Button variant="pill" onPress={() => setTarget(null)} style={styles.action} accessibilityLabel="Choose a different book">
        Choose a Different Book
      </Button>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
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
    loading: { marginTop: spacing.xl, alignItems: "center", gap: spacing.sm },
    hint: { fontSize: typeScale.xs, fontFamily: fonts.body, color: colors.inkFaint, fontStyle: "italic", marginTop: spacing.lg },
    errorText: { fontSize: typeScale.xs, fontFamily: fonts.body, color: colors.danger, marginTop: spacing.lg },
    chain: { marginTop: spacing.xl },
    pathTitle: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.ink, marginBottom: spacing.sm },
    node: { borderRadius: radii.sm, backgroundColor: colors.chipBackground, padding: spacing.md },
    nodeType: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
    nodeLabel: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.ink },
    link: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: spacing.lg, minHeight: 40 },
    linkLine: { width: 2, alignSelf: "stretch", backgroundColor: colors.border },
    linkText: { flex: 1, fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, paddingVertical: spacing.sm },
    action: { width: "100%", marginTop: spacing.lg },
  });
}
