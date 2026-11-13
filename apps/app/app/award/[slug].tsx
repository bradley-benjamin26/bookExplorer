import { useQuery } from "@tanstack/react-query";
import type { AwardWinner } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchAward } from "../../src/api/client";
import { AboutSection } from "../../src/components/AboutSection";
import { DetailTop } from "../../src/components/DetailTop";
import { EmptyState } from "../../src/components/EmptyState";
import { ErrorState } from "../../src/components/ErrorState";
import { Footer } from "../../src/components/Footer";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { PressableRow } from "../../src/components/PressableRow";
import { ShareButton } from "../../src/components/ShareButton";
import { DetailSkeleton } from "../../src/components/Skeleton";
import { SkipLink, SkipTarget } from "../../src/components/SkipLink";
import { groupWinners } from "../../src/awardWinners";
import { routes } from "../../src/navigation";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

export default function AwardDetail() {
  const { slug, label: rawLabel } = useLocalSearchParams<{ slug: string; label?: string | string[] }>();
  const label = typeof rawLabel === "string" ? rawLabel : undefined;
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["award", slug, label],
    queryFn: () => fetchAward(slug, label),
    enabled: !!slug,
  });

  if (isLoading) return <DetailSkeleton />;
  if (!data) return <ErrorState error={error} message={error instanceof Error ? error.message : `No award found for ${slug}`} />;

  const { authors, works, others } = groupWinners(data.winners);
  const chevron = (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ChevronRight size={18} color={colors.inkFaint} />
    </View>
  );
  const list = (title: string, name: string, items: AwardWinner[], href: (id: string) => ReturnType<typeof routes.work>) =>
    items.length > 0 && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
        {items.length > 1 && <SkipLink name={name} label={`Skip ${title.toLowerCase()}`} />}
        {items.map((w) => (
          <PressableRow
            key={w.wikidataId}
            label={w.label}
            tooltip={`Open ${w.label}`}
            onPress={w.openLibraryId ? () => router.push(href(w.openLibraryId!)) : undefined}
            trailing={w.openLibraryId ? chevron : undefined}
          >
            <Text style={styles.rowText}>{w.label}</Text>
          </PressableRow>
        ))}
        {items.length > 1 && <SkipTarget name={name} />}
      </View>
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
      <DetailTop title={data.name} actions={<ShareButton title={data.name} href={routes.award(data.slug, label)} />} />
      {data.description && <AboutSection text={data.description} />}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Winners</Text>
        {data.winners.length === 0 && <EmptyState message="No winners found for this award yet." />}
      </View>
      {list("Authors", "awards-authors", authors, routes.author)}
      {list("Works", "awards-works", works, routes.work)}
      {others.length > 0 && (
        <View style={styles.section}>
          {others.map((w) => (
            <Text key={w.wikidataId} style={styles.rowText}>{w.label}</Text>
          ))}
        </View>
      )}

      {data.wikidataId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Identifiers</Text>
          <View style={styles.identifierRow}>
            <Text style={styles.identifierSource}>Wikidata: </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Wikidata identifier ${data.wikidataId}`}
              onPress={() => void Linking.openURL(`https://www.wikidata.org/wiki/${data.wikidataId}`)}
            >
              <Text style={styles.identifierLink}>{data.wikidataId}</Text>
            </Pressable>
          </View>
        </View>
      )}
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    section: { marginTop: spacing.xl },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginTop: spacing.sm, marginBottom: spacing.md },
    rowText: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    identifierRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
    identifierSource: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    identifierLink: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.chipTextSubject, textDecorationLine: "underline" },
  });
}
