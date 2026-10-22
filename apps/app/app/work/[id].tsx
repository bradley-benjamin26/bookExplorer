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
import { SourceBadge } from "../../src/components/SourceBadge";
import { routes } from "../../src/navigation";
import { isItemSaved, toggleSaved } from "../../src/storage/savedItems";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import { titleCase } from "../../src/titleCase";

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
        <ActivityIndicator size="large" color={theme.colors.cover} />
      </View>
    );
  }

  if (isError || !data) {
    return <ErrorState message={error instanceof Error ? error.message : `No work found for ${id}`} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.coverUrl && <Image source={{ uri: data.coverUrl }} style={styles.cover} resizeMode="contain" />}
      <Text style={styles.title} accessibilityRole="header">{data.title}</Text>
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
      <Button
        variant="pill"
        active={saved}
        starIcon
        onPress={handleToggleSaved}
        style={styles.saveButton}
        accessibilityLabel={saved ? "Saved" : "Save"}
      >
        {saved ? "Saved" : "Save"}
      </Button>

      <Button
        variant="primary"
        onPress={() => router.push(routes.graph("work", data.openLibraryWorkId))}
        style={styles.graphButton}
      >
        View as Graph
      </Button>

      <EditionsSection editions={data.editions} highlighted={highlight === "editions"} />

      {data.genres.length > 0 && (
        <View style={styles.genresSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Genre</Text>
          <View style={styles.genreTags}>
            {data.genres.map((genre) => (
              <Pressable
                key={genre.label}
                style={({ pressed }) => [styles.genreTag, pressed && styles.pressed]}
                onPress={() => router.push(routes.subject(slugifySubject(genre.label)))}
                accessibilityRole="button"
                accessibilityLabel={titleCase(genre.label)}
              >
                <Text style={styles.genreTagText}>
                  {titleCase(genre.label)}
                  <SourceBadge sources={genre.sources} />
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {data.subjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Subjects</Text>
          <View style={styles.subjectTags}>
            {data.subjects.slice(0, 12).map((subject) => (
              <Pressable
                key={subject.label}
                style={({ pressed }) => [styles.subjectTag, pressed && styles.pressed]}
                onPress={() => router.push(routes.subject(slugifySubject(subject.label)))}
                accessibilityRole="button"
                accessibilityLabel={titleCase(subject.label)}
              >
                <Text style={styles.subjectTagText}>
                  {titleCase(subject.label)}
                  <SourceBadge sources={subject.sources} />
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {data.description && (
        <View style={styles.aboutSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">About</Text>
          <ExpandableText text={data.description} textStyle={styles.description} viewMoreStyle={styles.viewMore} />
        </View>
      )}

      <ReviewsSection reviews={data.reviews} />
    </ScrollView>
  );
}

function createStyles({ colors, cardStyle, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg, alignItems: "flex-start" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
    cover: { width: 180, height: 260, marginBottom: spacing.lg, borderRadius: 6, backgroundColor: colors.paper, ...cardStyle },
    title: { fontFamily: fonts.display, fontSize: typeScale.lg, textAlign: "left", letterSpacing: -0.3, color: colors.ink },
    author: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.sm,
      color: colors.cover,
      marginTop: spacing.xs,
      textDecorationLine: "underline",
    },
    saveButton: { marginTop: spacing.md },
    genresSection: { marginTop: spacing.xxl, width: "100%" },
    genreTags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    genreTag: { backgroundColor: colors.chipBackgroundGenre, borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 7 },
    genreTagText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: typeScale.xs,
      color: colors.chipTextGenre,
    },
    aboutSection: { marginTop: spacing.xxl, width: "100%" },
    description: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24 },
    viewMore: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
    graphButton: { width: "100%", marginTop: spacing.lg },
    pressed: { opacity: 0.6 },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    subjectsSection: { marginTop: spacing.xxl, width: "100%" },
    subjectTags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    // Matches how the graph explorer colors subject nodes, so the same
    // concept reads as the same color whether you're browsing a book/work
    // page or the graph.
    subjectTag: {
      backgroundColor: colors.chipBackgroundSubject,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
    },
    subjectTagText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: typeScale.xs,
      color: colors.chipTextSubject,
    },
  });
}
