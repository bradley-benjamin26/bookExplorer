import type { Book, Graph, Subject, Work } from "@book-explorer/shared";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchGraph, fetchSubject } from "../api/client";
import { routes } from "../navigation";
import {
  buildTasteProfile,
  FETCH_CONCURRENCY,
  mapWithConcurrency,
  rankRecommendations,
  type AuthorSeed,
  type Recommendation,
} from "../recommendations";
import { getSnapshot, type Snapshot } from "../storage/snapshot";
import { useThemedStyles, type Theme } from "../theme";
import { WorkListRow } from "./WorkListRow";

// Subject listings and author graphs change rarely; reuse a day-old copy rather than refetch on every visit.
const STALE_MS = 24 * 60 * 60 * 1000;

/** "Because you saved X" rows, computed on-device from the saved library. `refreshKey` changing re-reads it. */
export function RecommendationsSection({ refreshKey }: { refreshKey: unknown }) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    getSnapshot().then(setSnapshot);
  }, [refreshKey]);

  const profile = useMemo(() => {
    if (!snapshot) return null;
    const seeds: AuthorSeed[] = snapshot.items
      .filter((i) => !i.deletedAt && i.type === "author")
      .map((i) => ({ id: i.id, name: i.title, seedTitle: i.title }));
    // Saved books keep only author names; their ids come from the book's cached detail, which the offline cache keeps for saved items.
    const cachedBooks = queryClient.getQueriesData<Book>({ queryKey: ["book"] }).map(([, b]) => b);
    for (const record of snapshot.books) {
      if (record.deletedAt) continue;
      const cached = cachedBooks.find((b) => b?.isbn === record.isbn);
      for (const a of cached?.authors ?? []) seeds.push({ id: a.openLibraryId, name: a.name, seedTitle: record.title });
    }
    return buildTasteProfile(snapshot, seeds);
  }, [snapshot, queryClient]);

  const slugs = profile?.subjects.map((s) => s.slug) ?? [];
  const authorIds = profile?.authors.map((a) => a.id) ?? [];
  const { data } = useQuery({
    queryKey: ["recommendations", slugs, authorIds],
    enabled: slugs.length + authorIds.length > 0,
    staleTime: STALE_MS,
    queryFn: async () => {
      // Shares the detail screens' cache keys, so those entries (and their persisted copies) are reused both ways.
      const fetchOne = <T,>(queryKey: QueryKey, queryFn: () => Promise<T>) =>
        queryClient.fetchQuery({ queryKey, queryFn, staleTime: STALE_MS }).catch(() => queryClient.getQueryData<T>(queryKey) ?? null);
      const jobs: (() => Promise<Subject | Graph | null>)[] = [
        ...slugs.map((slug) => () => fetchOne<Subject>(["subject", slug], () => fetchSubject(slug))),
        ...authorIds.map((id) => () => fetchOne<Graph>(["graph", "author", id], () => fetchGraph("author", id))),
      ];
      const results = await mapWithConcurrency(jobs, FETCH_CONCURRENCY, (job) => job());
      return { subjects: results.slice(0, slugs.length) as (Subject | null)[], graphs: results.slice(slugs.length) as (Graph | null)[] };
    },
  });

  const recommendations = useMemo(() => {
    if (!profile || !data) return [];
    const subjects = new Map<string, Subject>();
    data.subjects.forEach((s, i) => s && subjects.set(slugs[i], s));
    const graphs = new Map<string, Graph>();
    data.graphs.forEach((g, i) => g && graphs.set(authorIds[i], g));
    // Ratings only from works and books already fetched; no extra requests for them.
    const ratings = new Map<string, number>();
    for (const [, d] of queryClient.getQueriesData<Work | Book>({ predicate: (q) => q.queryKey[0] === "work" || q.queryKey[0] === "book" })) {
      if (d?.openLibraryWorkId && d.rating) ratings.set(d.openLibraryWorkId, d.rating.average);
    }
    return rankRecommendations(profile, subjects, graphs, ratings);
  }, [profile, data, queryClient]); // slugs/authorIds derive from profile

  if (recommendations.length === 0) return null;

  // One group per saved item, in the order of its best recommendation.
  const groups = new Map<string, Recommendation[]>();
  for (const r of recommendations) groups.set(r.because, [...(groups.get(r.because) ?? []), r]);

  return (
    <View>
      {[...groups].map(([because, recs]) => (
        <View key={because}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Because you saved {because}
          </Text>
          {recs.map((r) => (
            <WorkListRow
              key={r.work.openLibraryWorkId}
              work={r.work}
              note={`shares: ${r.shares.join(", ")}`}
              onPress={() => router.push(routes.work(r.work.openLibraryWorkId))}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginTop: spacing.xxl, marginBottom: spacing.md },
  });
}
