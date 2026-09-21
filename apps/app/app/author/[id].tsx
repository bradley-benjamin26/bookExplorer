import { useQuery } from "@tanstack/react-query";
import type { AuthorRelation } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchAuthor } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { ErrorState } from "../../src/components/ErrorState";
import { routes } from "../../src/navigation";
import { isItemSaved, toggleSaved } from "../../src/storage/savedItems";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

const SECTIONS: { relation: AuthorRelation["relation"]; title: string }[] = [
  { relation: "influencedBy", title: "Influenced by" },
  { relation: "influenced", title: "Influenced" },
  { relation: "notableWork", title: "Notable Works" },
  { relation: "movement", title: "Literary Movement" },
];

export default function AuthorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["author", id],
    queryFn: () => fetchAuthor(id),
    enabled: !!id,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (id) isItemSaved("author", id).then(setSaved);
  }, [id]);

  const handleToggleSaved = async () => {
    if (!data) return;
    const nowSaved = await toggleSaved({ type: "author", id: data.openLibraryId, title: data.name });
    setSaved(nowSaved);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }

  if (isError || !data) {
    return <ErrorState message={error instanceof Error ? error.message : `No author found for ${id}`} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{data.name}</Text>
      {(data.birthDate || data.deathDate) && (
        <Text style={styles.dates}>
          {data.birthDate ?? "?"} – {data.deathDate ?? "present"}
        </Text>
      )}
      <Button variant="pill" active={saved} onPress={handleToggleSaved} style={styles.saveButton}>
        {saved ? "★ Saved" : "☆ Save"}
      </Button>
      {data.bio && <Text style={styles.bio}>{data.bio}</Text>}
      {/* Wikipedia's text is CC BY-SA, which requires attribution on reuse. */}
      {data.bioSource === "wikipedia" && data.bioSourceUrl && (
        <Pressable
          style={({ pressed }) => pressed && styles.pressed}
          onPress={() => Linking.openURL(data.bioSourceUrl!)}
        >
          <Text style={styles.bioSource}>via Wikipedia</Text>
        </Pressable>
      )}
      {data.pseudonyms.length > 0 && (
        <Text style={styles.pseudonyms}>Also published as {data.pseudonyms.join(", ")}</Text>
      )}

      {!data.wikidataId && (
        <Text style={styles.noMatch}>No Wikidata match found — showing Open Library data only.</Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.openLibraryLink, pressed && styles.pressed]}
        onPress={() => Linking.openURL(`https://openlibrary.org/authors/${data.openLibraryId}`)}
      >
        <Text style={styles.openLibraryLinkText}>View on Open Library</Text>
      </Pressable>

      <Button
        variant="primary"
        onPress={() => router.push(routes.graph("author", data.openLibraryId))}
        style={styles.graphButton}
      >
        View as Graph
      </Button>

      {SECTIONS.map(({ relation, title }) => {
        const items = data.relations.filter((r) => r.relation === relation);
        if (items.length === 0) return null;

        return (
          <View key={relation} style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {items.map((item) => {
              const navigable = relation === "influencedBy" || relation === "influenced";
              const isNavigable = !!item.openLibraryId && navigable;
              const content = (
                <View style={styles.relationRow}>
                  <Text style={styles.relationLabel}>{item.label}</Text>
                  {isNavigable && <Text style={styles.relationChevron}>›</Text>}
                </View>
              );
              return isNavigable ? (
                <Pressable
                  key={item.wikidataId}
                  style={({ pressed }) => pressed && styles.pressed}
                  onPress={() => router.push(routes.author(item.openLibraryId!))}
                >
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

function createStyles({ colors, kicker }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    name: { fontSize: 27, fontWeight: "700", letterSpacing: -0.3, color: colors.text },
    dates: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
    saveButton: { marginTop: 14 },
    bio: { fontSize: 15, color: colors.text, marginTop: 16, lineHeight: 22 },
    bioSource: { fontSize: 12, color: colors.link, marginTop: 6 },
    pseudonyms: { fontSize: 13, color: colors.textMuted, marginTop: 10, fontStyle: "italic" },
    noMatch: { fontSize: 13, color: colors.warning, marginTop: 16, fontStyle: "italic" },
    openLibraryLink: { alignSelf: "flex-start", marginTop: 16 },
    openLibraryLinkText: { fontSize: 14, color: colors.link, fontWeight: "600" },
    graphButton: { marginTop: 20 },
    pressed: { opacity: 0.6 },
    section: { marginTop: 28 },
    sectionTitle: { ...kicker, marginBottom: 12 },
    relationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    relationLabel: { fontSize: 16, color: colors.text },
    relationChevron: { fontSize: 18, color: colors.textFaint, fontWeight: "600" },
  });
}
