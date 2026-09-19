import { useQuery } from "@tanstack/react-query";
import type { AuthorRelation } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchAuthor } from "../../src/api/client";
import { routes } from "../../src/navigation";

const SECTIONS: { relation: AuthorRelation["relation"]; title: string }[] = [
  { relation: "influencedBy", title: "Influenced by" },
  { relation: "influenced", title: "Influenced" },
  { relation: "notableWork", title: "Notable Works" },
  { relation: "movement", title: "Literary Movement" },
];

export default function AuthorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["author", id],
    queryFn: () => fetchAuthor(id),
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
          {error instanceof Error ? error.message : `No author found for ${id}`}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{data.name}</Text>
      {(data.birthDate || data.deathDate) && (
        <Text style={styles.dates}>
          {data.birthDate ?? "?"} – {data.deathDate ?? "present"}
        </Text>
      )}
      {data.bio && <Text style={styles.bio}>{data.bio}</Text>}

      {!data.wikidataId && (
        <Text style={styles.noMatch}>No Wikidata match found — showing Open Library data only.</Text>
      )}

      {data.relations.length > 0 && (
        <Pressable style={styles.graphButton} onPress={() => router.push(routes.graph("author", data.openLibraryId))}>
          <Text style={styles.graphButtonText}>View as Graph</Text>
        </Pressable>
      )}

      {SECTIONS.map(({ relation, title }) => {
        const items = data.relations.filter((r) => r.relation === relation);
        if (items.length === 0) return null;

        return (
          <View key={relation} style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {items.map((item) => {
              const navigable = relation === "influencedBy" || relation === "influenced";
              const content = (
                <View style={styles.relationRow}>
                  <Text style={styles.relationLabel}>{item.label}</Text>
                </View>
              );
              return item.openLibraryId && navigable ? (
                <Pressable key={item.wikidataId} onPress={() => router.push(routes.author(item.openLibraryId!))}>
                  {content}
                </Pressable>
              ) : (
                <View key={item.wikidataId}>{content}</View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { textAlign: "center", fontSize: 16, color: "#a33" },
  name: { fontSize: 26, fontWeight: "700" },
  dates: { fontSize: 15, color: "#888", marginTop: 4 },
  bio: { fontSize: 15, color: "#333", marginTop: 16, lineHeight: 22 },
  noMatch: { fontSize: 13, color: "#a80", marginTop: 16, fontStyle: "italic" },
  graphButton: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 20,
  },
  graphButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#888", marginBottom: 10 },
  relationRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  relationLabel: { fontSize: 16, color: "#1a1a2e" },
});
