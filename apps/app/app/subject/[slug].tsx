import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { slugifySubject } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchSubject, searchBooks } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Footer } from "../../src/components/Footer";
import { ErrorState } from "../../src/components/ErrorState";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { WorkListRow } from "../../src/components/WorkListRow";
import { ShareButton } from "../../src/components/ShareButton";
import { routes } from "../../src/navigation";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import { booksForSort, DEFAULT_SUBJECT_SORT, SUBJECT_SORTS, subjectSortParams } from "../../src/subjectSort";
import { titleCase } from "../../src/titleCase";

export default function SubjectDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["subject", slug],
    queryFn: () => fetchSubject(slug),
    enabled: !!slug,
  });

  const [sort, setSort] = useState(DEFAULT_SUBJECT_SORT);
  const sortParams = data ? subjectSortParams(data.name, sort) : null;
  const sorted = useQuery({
    queryKey: ["search", sortParams],
    queryFn: () => searchBooks(sortParams!),
    enabled: !!sortParams,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.cover} />
      </View>
    );
  }

  if (!data) {
    return <ErrorState error={error} message={error instanceof Error ? error.message : `No subject found for ${slug}`} />;
  }

  const { books, fellBack } = booksForSort(!!sortParams, sorted, data.books);
  const broader = data.relatedConcepts.filter((c) => c.relation === "broader");
  const narrower = data.relatedConcepts.filter((c) => c.relation === "narrower");

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={books}
      keyExtractor={(item) => item.openLibraryWorkId}
      ListHeaderComponent={
        <View>
          <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
          <Text style={styles.name} accessibilityRole="header">{titleCase(data.name)}</Text>
          <Text style={styles.workCount}>{data.workCount.toLocaleString()} works</Text>
          {data.description && <Text style={styles.description}>{data.description}</Text>}

          <ShareButton title={titleCase(data.name)} href={routes.subject(data.slug)} style={{ marginTop: 8 }} />

          {!data.wikidataId && (
            <Text style={styles.noMatch}>No Wikidata concept match found for this subject.</Text>
          )}

          <Button
            variant="primary"
            onPress={() => router.push(routes.graph("subject", data.slug))}
            style={styles.graphButton}
          >
            View as Graph
          </Button>

          {[
            { title: "Broader topics", items: broader },
            { title: "Narrower topics", items: narrower },
          ].map(
            ({ title, items }) =>
              items.length > 0 && (
                <View key={title} style={styles.conceptSection}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
                  <View style={styles.conceptTags}>
                    {items.map((concept) => (
                      <Pressable
                        key={concept.label}
                        style={({ pressed }) => [styles.conceptTag, pressed && styles.pressed]}
                        onPress={() => router.push(routes.subject(slugifySubject(concept.label)))}
                        accessibilityRole="button"
                        accessibilityLabel={titleCase(concept.label)}
                      >
                        <Text style={styles.conceptTagText}>
                          {titleCase(concept.label)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )
          )}

          <Text style={styles.sectionTitle} accessibilityRole="header">Books</Text>
          <View style={styles.conceptTags}>
            {SUBJECT_SORTS.map((s) => (
              <Button key={s.value} variant="pill" active={sort === s.value} onPress={() => setSort(s.value)} accessibilityLabel={`Sort by ${s.label.toLowerCase()}`}>
                {s.label}
              </Button>
            ))}
          </View>
          {sortParams && sorted.isLoading && <ActivityIndicator color={theme.colors.cover} style={styles.sortSpinner} />}
          {fellBack && <Text style={styles.noMatch}>Couldn't load this order, showing the classic list.</Text>}
        </View>
      }
      renderItem={({ item }) => (
        <WorkListRow work={item} onPress={() => router.push(routes.work(item.openLibraryWorkId))} />
      )}
      ListFooterComponent={<Footer />}
    />
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
    name: {
      fontFamily: fonts.display,
      fontSize: typeScale.lg,
      letterSpacing: -0.3,
      color: colors.ink,
    },
    workCount: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.xs },
    description: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24, marginTop: spacing.sm },
    noMatch: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.warning, marginTop: spacing.md, fontStyle: "italic" },
    graphButton: { marginTop: spacing.lg },
    sortSpinner: { marginTop: spacing.md },
    pressed: { opacity: 0.6 },
    conceptSection: { marginTop: spacing.xl },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginTop: spacing.sm, marginBottom: spacing.md },
    conceptTags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    conceptTag: {
      backgroundColor: colors.chipBackgroundAccent,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.chipBorderAccent,
    },
    conceptTagText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.chipTextAccent },
  });
}
