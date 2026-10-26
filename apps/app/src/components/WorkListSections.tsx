import { useQuery } from "@tanstack/react-query";
import type { Series, WorkRef } from "@book-explorer/shared";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { fetchSeries } from "../api/client";
import { routes } from "../navigation";
import { useThemedStyles, type Theme } from "../theme";
import { WorkListRow } from "./WorkListRow";

/** "More by this author" (or the author page's own works) — a titled list of WorkListRows. */
export function MoreByAuthor({ title, works }: { title: string; works?: WorkRef[] }) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  if (!works?.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {works.map((w) => (
        <WorkListRow key={w.openLibraryWorkId} work={w} onPress={() => router.push(routes.work(w.openLibraryWorkId))} />
      ))}
    </View>
  );
}

/** The work's series in order, with the current book marked. Fetched lazily; hidden while loading or on error. */
export function SeriesSection({ seriesQid, currentWorkId }: { seriesQid?: string; currentWorkId: string }) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { data } = useQuery<Series>({
    queryKey: ["series", seriesQid],
    queryFn: () => fetchSeries(seriesQid!),
    enabled: !!seriesQid,
  });
  if (!data?.members.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{data.name}</Text>
      {data.members.map((m) => {
        const current = m.openLibraryWorkId === currentWorkId;
        const id = m.openLibraryWorkId;
        return (
          <WorkListRow
            key={m.wikidataId}
            work={{ openLibraryWorkId: id ?? "", title: m.title, authors: [], coverUrl: null }}
            series={{ position: m.position, current }}
            onPress={id && !current ? () => router.push(routes.work(id)) : undefined}
          />
        );
      })}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    section: { marginTop: spacing.xxl, width: "100%" },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
  });
}
