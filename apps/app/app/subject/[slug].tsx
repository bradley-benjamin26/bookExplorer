import { useQuery } from "@tanstack/react-query";
import { slugifySubject } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchSubject } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { ErrorState } from "../../src/components/ErrorState";
import { routes } from "../../src/navigation";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

export default function SubjectDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["subject", slug],
    queryFn: () => fetchSubject(slug),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }

  if (isError || !data) {
    return <ErrorState message={error instanceof Error ? error.message : `No subject found for ${slug}`} />;
  }

  const broader = data.relatedConcepts.filter((c) => c.relation === "broader");
  const narrower = data.relatedConcepts.filter((c) => c.relation === "narrower");

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={data.books}
      keyExtractor={(item) => item.openLibraryWorkId}
      ListHeaderComponent={
        <View>
          <Text style={styles.name}>{data.name}</Text>
          <Text style={styles.workCount}>{data.workCount.toLocaleString()} works</Text>

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
                  <Text style={styles.sectionTitle}>{title}</Text>
                  <View style={styles.conceptTags}>
                    {items.map((concept) => (
                      <Pressable
                        key={concept.wikidataId}
                        style={({ pressed }) => [styles.conceptTag, pressed && styles.pressed]}
                        onPress={() => router.push(routes.subject(slugifySubject(concept.label)))}
                      >
                        <Text style={styles.conceptTagText}>{concept.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )
          )}

          <Text style={styles.sectionTitle}>Books</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.bookRow, pressed && styles.pressed]}
          onPress={() => router.push(routes.work(item.openLibraryWorkId))}
        >
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.bookCover} resizeMode="contain" />
          ) : (
            <View style={styles.bookCoverPlaceholder} />
          )}
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.bookAuthors} numberOfLines={1}>
              {item.authors.map((a) => a.name).join(", ")}
            </Text>
          </View>
          <Text style={styles.bookChevron}>›</Text>
        </Pressable>
      )}
    />
  );
}

function createStyles({ colors, kicker }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    name: { fontSize: 27, fontWeight: "700", textTransform: "capitalize", letterSpacing: -0.3, color: colors.text },
    workCount: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
    noMatch: { fontSize: 13, color: colors.warning, marginTop: 12, fontStyle: "italic" },
    graphButton: { marginTop: 16 },
    pressed: { opacity: 0.6 },
    conceptSection: { marginTop: 24 },
    sectionTitle: { ...kicker, marginTop: 8, marginBottom: 12 },
    conceptTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    conceptTag: {
      backgroundColor: colors.chipBackgroundAccent,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.chipBorderAccent,
    },
    conceptTagText: { fontSize: 13, color: colors.chipTextAccent },
    bookRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    bookCover: { width: 44, height: 64, borderRadius: 4 },
    bookCoverPlaceholder: { width: 44, height: 64, borderRadius: 4, backgroundColor: colors.chipBackground },
    bookInfo: { flex: 1, justifyContent: "center" },
    bookTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
    bookAuthors: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
    bookChevron: { fontSize: 18, color: colors.textFaint, fontWeight: "600" },
  });
}
