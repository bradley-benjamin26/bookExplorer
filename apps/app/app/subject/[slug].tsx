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

export default function SubjectDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["subject", slug],
    queryFn: () => fetchSubject(slug),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : `No subject found for ${slug}`}
        </Text>
      </View>
    );
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
                        style={styles.conceptTag}
                        onPress={() => router.push(`/subject/${slugifySubject(concept.label)}`)}
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
        <Pressable style={styles.bookRow} onPress={() => router.push(`/work/${item.openLibraryWorkId}`)}>
          {item.coverUrl && <Image source={{ uri: item.coverUrl }} style={styles.bookCover} resizeMode="contain" />}
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle}>{item.title}</Text>
            <Text style={styles.bookAuthors}>{item.authors.map((a) => a.name).join(", ")}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { textAlign: "center", fontSize: 16, color: "#a33" },
  name: { fontSize: 26, fontWeight: "700", textTransform: "capitalize" },
  workCount: { fontSize: 15, color: "#888", marginTop: 4 },
  noMatch: { fontSize: 13, color: "#a80", marginTop: 12, fontStyle: "italic" },
  conceptSection: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#888", marginTop: 8, marginBottom: 10 },
  conceptTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  conceptTag: { backgroundColor: "#eef2ff", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  conceptTagText: { fontSize: 13, color: "#3346a8" },
  bookRow: { flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  bookCover: { width: 44, height: 64 },
  bookInfo: { flex: 1, justifyContent: "center" },
  bookTitle: { fontSize: 16, fontWeight: "600" },
  bookAuthors: { fontSize: 14, color: "#666", marginTop: 2 },
});
