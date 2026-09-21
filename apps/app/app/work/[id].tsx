import { useQuery } from "@tanstack/react-query";
import { slugifySubject } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchWork } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { ErrorState } from "../../src/components/ErrorState";
import { EditionsSection } from "../../src/components/EditionsSection";
import { ExpandableText } from "../../src/components/ExpandableText";
import { RatingBadge } from "../../src/components/RatingBadge";
import { ReviewsSection } from "../../src/components/ReviewsSection";
import { routes } from "../../src/navigation";
import { isItemSaved, toggleSaved } from "../../src/storage/savedItems";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

export default function WorkDetail() {
  const { id, highlight } = useLocalSearchParams<{ id: string; highlight?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["work", id],
    queryFn: () => fetchWork(id),
    enabled: !!id,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (id) isItemSaved("work", id).then(setSaved);
  }, [id]);

  const handleToggleSaved = async () => {
    if (!data) return;
    const nowSaved = await toggleSaved({ type: "work", id: data.openLibraryWorkId, title: data.title });
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
    return <ErrorState message={error instanceof Error ? error.message : `No work found for ${id}`} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.coverUrl && <Image source={{ uri: data.coverUrl }} style={styles.cover} resizeMode="contain" />}
      <Text style={styles.title}>{data.title}</Text>
      {data.authors.map((author) => (
        <Pressable
          key={author.openLibraryId}
          style={({ pressed }) => pressed && styles.pressed}
          onPress={() => router.push(routes.author(author.openLibraryId))}
        >
          <Text style={styles.author}>{author.name}</Text>
        </Pressable>
      ))}
      <RatingBadge rating={data.rating} />
      <Button variant="pill" active={saved} onPress={handleToggleSaved} style={styles.saveButton}>
        {saved ? "★ Saved" : "☆ Save"}
      </Button>

      <EditionsSection editions={data.editions} highlighted={highlight === "editions"} />

      {data.genres.length > 0 && (
        <View style={styles.genresSection}>
          <Text style={styles.sectionTitle}>Genre</Text>
          <View style={styles.genreTags}>
            {data.genres.map((genre) => (
              <Pressable
                key={genre}
                style={({ pressed }) => [styles.genreTag, pressed && styles.pressed]}
                onPress={() => router.push(routes.subject(slugifySubject(genre)))}
              >
                <Text style={styles.genreTagText}>{genre}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {data.subjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle}>Subjects</Text>
          <View style={styles.subjectTags}>
            {data.subjects.slice(0, 12).map((subject) => (
              <Pressable
                key={subject}
                style={({ pressed }) => [styles.subjectTag, pressed && styles.pressed]}
                onPress={() => router.push(routes.subject(slugifySubject(subject)))}
              >
                <Text style={styles.subjectTagText}>{subject}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Button
        variant="primary"
        onPress={() => router.push(routes.graph("work", data.openLibraryWorkId))}
        style={styles.graphButton}
      >
        View as Graph
      </Button>

      {data.description && (
        <View style={styles.aboutSection}>
          <Text style={styles.sectionTitle}>About</Text>
          <ExpandableText text={data.description} textStyle={styles.description} viewMoreStyle={styles.viewMore} />
        </View>
      )}

      <ReviewsSection reviews={data.reviews} />
    </ScrollView>
  );
}

function createStyles({ colors, kicker, cardStyle }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, alignItems: "center" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    cover: { width: 180, height: 260, marginBottom: 20, borderRadius: 6, backgroundColor: colors.background, ...cardStyle },
    title: { fontSize: 25, fontWeight: "700", textAlign: "center", letterSpacing: -0.3, color: colors.text },
    author: { fontSize: 17, color: colors.link, marginTop: 4, textDecorationLine: "underline" },
    saveButton: { marginTop: 14 },
    genresSection: { marginTop: 28, width: "100%" },
    genreTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    genreTag: { backgroundColor: colors.chipBackgroundGenre, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 7 },
    genreTagText: { fontSize: 13, fontWeight: "600", color: colors.chipTextGenre },
    aboutSection: { marginTop: 28, width: "100%" },
    description: { fontSize: 15, color: colors.text, lineHeight: 22 },
    viewMore: { fontSize: 13, fontWeight: "600", color: colors.link, marginTop: 6 },
    graphButton: { width: "100%", marginTop: 20 },
    pressed: { opacity: 0.6 },
    sectionTitle: { ...kicker, marginBottom: 12 },
    subjectsSection: { marginTop: 28, width: "100%" },
    subjectTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    // Matches how the graph explorer colors subject nodes, so the same
    // concept reads as the same color whether you're browsing a book/work
    // page or the graph.
    subjectTag: {
      backgroundColor: colors.chipBackgroundSubject,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    subjectTagText: { fontSize: 13, fontWeight: "600", color: colors.chipTextSubject },
  });
}
