import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchBookByIsbn } from "../../src/api/client";
import { addRecentIsbn } from "../../src/storage/history";

export default function BookDetail() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["book", isbn],
    queryFn: () => fetchBookByIsbn(isbn),
    enabled: !!isbn,
  });

  useEffect(() => {
    if (data) addRecentIsbn(data.isbn);
  }, [data]);

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
          {error instanceof Error ? error.message : `No book found for ISBN ${isbn}`}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.coverUrl && <Image source={{ uri: data.coverUrl }} style={styles.cover} resizeMode="contain" />}
      <Text style={styles.title}>{data.title}</Text>
      {data.authors.map((author) => (
        <Pressable key={author.openLibraryId} onPress={() => router.push(`/author/${author.openLibraryId}`)}>
          <Text style={styles.author}>{author.name}</Text>
        </Pressable>
      ))}
      {data.description && <Text style={styles.description}>{data.description}</Text>}
      {data.subjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle}>Subjects</Text>
          <View style={styles.subjectTags}>
            {data.subjects.slice(0, 12).map((subject) => (
              <View key={subject} style={styles.subjectTag}>
                <Text style={styles.subjectTagText}>{subject}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { textAlign: "center", fontSize: 16, color: "#a33" },
  cover: { width: 180, height: 260, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  author: { fontSize: 17, color: "#1a4fba", marginTop: 4, textDecorationLine: "underline" },
  description: { fontSize: 15, color: "#333", marginTop: 16, lineHeight: 22 },
  subjectsSection: { marginTop: 24, width: "100%" },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#888", marginBottom: 10 },
  subjectTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subjectTag: { backgroundColor: "#f0f0f0", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  subjectTagText: { fontSize: 13, color: "#444" },
});
