import { useQuery } from "@tanstack/react-query";
import { slugifySubject } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchWork } from "../../src/api/client";
import { routes } from "../../src/navigation";

export default function WorkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["work", id],
    queryFn: () => fetchWork(id),
    enabled: !!id,
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
          {error instanceof Error ? error.message : `No work found for ${id}`}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.coverUrl && <Image source={{ uri: data.coverUrl }} style={styles.cover} resizeMode="contain" />}
      <Text style={styles.title}>{data.title}</Text>
      {data.authors.map((author) => (
        <Pressable key={author.openLibraryId} onPress={() => router.push(routes.author(author.openLibraryId))}>
          <Text style={styles.author}>{author.name}</Text>
        </Pressable>
      ))}
      {data.description && <Text style={styles.description}>{data.description}</Text>}

      <Pressable style={styles.graphButton} onPress={() => router.push(routes.graph("work", data.openLibraryWorkId))}>
        <Text style={styles.graphButtonText}>View as Graph</Text>
      </Pressable>

      {data.subjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle}>Subjects</Text>
          <View style={styles.subjectTags}>
            {data.subjects.slice(0, 12).map((subject) => (
              <Pressable
                key={subject}
                style={styles.subjectTag}
                onPress={() => router.push(routes.subject(slugifySubject(subject)))}
              >
                <Text style={styles.subjectTagText}>{subject}</Text>
              </Pressable>
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
  graphButton: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 20,
  },
  graphButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  subjectsSection: { marginTop: 24, width: "100%" },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#888", marginBottom: 10 },
  subjectTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subjectTag: { backgroundColor: "#f0f0f0", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  subjectTagText: { fontSize: 13, color: "#444" },
});
