import { type Book, type Graph, type Subject, type Work, type WorkRef } from "@book-explorer/shared";
import { useIsRestoring, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchGraph, fetchSubject, searchBooks } from "../api/client";
import { routes } from "../navigation";
import {
  buildTasteProfile,
  detailLanded,
  FETCH_CONCURRENCY,
  loadSubjectBooks,
  mapWithConcurrency,
  groupRecommendations,
  rankRecommendations,
  seedsFromCache,
  recommendationsStatus,
} from "../recommendations";
import { getSnapshot, snapshotForList, type Snapshot } from "../storage/snapshot";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";
import { WorkListRow } from "./WorkListRow";

// Subject listings and author graphs change rarely; reuse a day-old copy rather than refetch on every visit.
const STALE_MS = 24 * 60 * 60 * 1000;

/** Rows grouped by what they share with, computed on-device from the saved library. `refreshKey` changing re-reads it. */
export function RecommendationsSection({ refreshKey, listId }: { refreshKey: unknown; listId: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  // Groups the user opened or closed, by reasonKey; the rest follow the default (only the first open).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    getSnapshot().then((s) => setSnapshot(listId ? snapshotForList(s, listId) : s));
  }, [refreshKey, listId]);
  const restoring = useIsRestoring(); // the persisted cache feeds seeds, so wait for it
  // Book and work details feed author ids, public subjects and ratings, and can land after the
  // snapshot (persisted cache hydrating, a detail opened elsewhere), so re-read when one does.
  const [cacheVersion, setCacheVersion] = useState(0);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((e) => {
        if (detailLanded(e)) setCacheVersion((v) => v + 1);
      }),
    [queryClient]
  );

  const profile = useMemo(() => {
    if (!snapshot) return null;
    // Ids and public subjects come from cached details, which the offline cache keeps for saved items.
    const { seeds, publicSlugs } = seedsFromCache(
      snapshot,
      (isbn) => queryClient.getQueryData<Book>(["book", isbn]),
      (workId) => queryClient.getQueryData<Work>(["work", workId])
    );
    return buildTasteProfile(snapshot, seeds, publicSlugs);
  }, [snapshot, queryClient, cacheVersion]);

  const subjectTerms = profile?.subjects ?? [];
  const slugs = subjectTerms.map((s) => s.slug);
  const authorIds = profile?.authors.map((a) => a.id) ?? [];
  const seedCount = slugs.length + authorIds.length;
  const { data, isFetching } = useQuery({
    queryKey: ["recommendations", slugs, authorIds],
    enabled: seedCount > 0,
    staleTime: STALE_MS,
    queryFn: async () => {
      // Shares the detail screens' cache keys, so those entries (and their persisted copies) are reused both ways.
      const fetchOne = <T,>(queryKey: QueryKey, queryFn: () => Promise<T>) =>
        queryClient.fetchQuery({ queryKey, queryFn, staleTime: STALE_MS }).catch(() => queryClient.getQueryData<T>(queryKey) ?? null);
      const jobs: (() => Promise<{ books: WorkRef[] } | Graph | null>)[] = [
        ...subjectTerms.map((s) => () =>
          loadSubjectBooks(s.label, s.slug, {
            // The subject page's "Most read" key, so that cache is shared.
            searchSorted: (p) => fetchOne<WorkRef[]>(["search", p], () => searchBooks(p)),
            classic: (slug) => fetchOne<Subject>(["subject", slug], () => fetchSubject(slug)),
          })
        ),
        ...authorIds.map((id) => () => fetchOne<Graph>(["graph", "author", id], () => fetchGraph("author", id))),
      ];
      const results = await mapWithConcurrency(jobs, FETCH_CONCURRENCY, (job) => job());
      return { subjects: results.slice(0, slugs.length) as ({ books: WorkRef[] } | null)[], graphs: results.slice(slugs.length) as (Graph | null)[] };
    },
  });

  const recommendations = useMemo(() => {
    if (!profile || !data) return [];
    const subjects = new Map<string, { books: WorkRef[] }>();
    data.subjects.forEach((s, i) => s && subjects.set(slugs[i], s));
    const graphs = new Map<string, Graph>();
    data.graphs.forEach((g, i) => g && graphs.set(authorIds[i], g));
    // Ratings only from works and books already fetched; no extra requests for them.
    const ratings = new Map<string, number>();
    for (const [, d] of queryClient.getQueriesData<Work | Book>({ predicate: (q) => q.queryKey[0] === "work" || q.queryKey[0] === "book" })) {
      if (d?.openLibraryWorkId && d.rating) ratings.set(d.openLibraryWorkId, d.rating.average);
    }
    return rankRecommendations(profile, subjects, graphs, ratings);
  }, [profile, data, queryClient, cacheVersion]); // slugs/authorIds derive from profile

  const status = recommendationsStatus({ ready: snapshot !== null && !restoring, seedCount, fetching: isFetching, count: recommendations.length });
  if (status === "loading") return <ActivityIndicator color={theme.colors.cover} accessibilityLabel="Loading recommendations" />;
  if (status === "empty") return <Text style={styles.emptyText}>Not enough books or authors to make recommendations</Text>;

  const groups = groupRecommendations(recommendations);

  return (
    <View>
      {[...groups].map(([key, { heading, recs }], index) => {
        const expanded = toggled[key] ?? index === 0;
        const Chevron = expanded ? ChevronDown : ChevronRight;
        return (
        <View key={key}>
          <Pressable
            ref={titleRef(`${expanded ? "Hide" : "Show"} ${heading}`)}
            style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
            onPress={() => setToggled((t) => ({ ...t, [key]: !expanded }))}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
          >
            <Text style={styles.sectionTitle}>
              {heading} ({recs.length})
            </Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Chevron size={18} color={theme.colors.inkFaint} strokeWidth={2} />
            </View>
          </Pressable>
          {expanded && recs.map((r) => (
            <WorkListRow
              key={r.work.openLibraryWorkId}
              work={r.work}
              note={`shares: ${r.shares.join(", ")}`}
              onPress={() => router.push(routes.work(r.work.openLibraryWorkId))}
            />
          ))}
        </View>
        );
      })}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    emptyText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, fontStyle: "italic", marginTop: spacing.lg },
    groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginTop: spacing.xxl, marginBottom: spacing.md },
    pressed: { opacity: 0.6 },
    sectionTitle: { flexShrink: 1, fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink },
  });
}
