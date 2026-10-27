import { useQuery } from "@tanstack/react-query";
import { slugifySubject } from "@book-explorer/shared";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image } from "expo-image";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchWork } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Footer } from "../../src/components/Footer";
import { ErrorState } from "../../src/components/ErrorState";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { EditionsSection } from "../../src/components/EditionsSection";
import { ExpandableText } from "../../src/components/ExpandableText";
import { RatingBadge } from "../../src/components/RatingBadge";
import { ReviewsSection } from "../../src/components/ReviewsSection";
import { SavedRecordEditor } from "../../src/components/SavedRecordEditor";
import { MoreByAuthor, SeriesSection } from "../../src/components/WorkListSections";
import { AddToListButton } from "../../src/components/AddToListButton";
import { ShareButton } from "../../src/components/ShareButton";
import { routes } from "../../src/navigation";
import { addRecent } from "../../src/storage/history";
import { getSavedWork, saveWork, seedSavedWorkFromApi, updateSavedWork, type SavedWorkRecord } from "../../src/storage/savedWorks";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import { titleCase } from "../../src/titleCase";
import { titleRef } from "../../src/webTitle";

export default function WorkDetail() {
  const { id, highlight } = useLocalSearchParams<{ id: string; highlight?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["work", id],
    queryFn: () => fetchWork(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (data) addRecent({ kind: "work", id: data.openLibraryWorkId, title: data.title, subtitle: data.authors.map((a) => a.name).join(", ") || null });
  }, [data]);

  // Saved exactly when it has a saved record, as on the book page.
  const [savedRecord, setSavedRecord] = useState<SavedWorkRecord | null>(null);

  // Re-read on every focus: this screen stays mounted under others, so an edit
  // or removal on the Saved screen would otherwise not show here.
  // Saved under the id the server returned, in case it differs from the route's.
  const savedId = data?.openLibraryWorkId ?? id;
  useFocusEffect(
    useCallback(() => {
      if (savedId) getSavedWork(savedId).then(setSavedRecord);
    }, [savedId])
  );

  // A record from the migration or a v1 import starts blank; give it the API's tags once they load.
  useEffect(() => {
    if (data && savedRecord) seedSavedWorkFromApi(savedRecord.openLibraryWorkId, data).then((r) => r && setSavedRecord(r));
  }, [data, savedRecord]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.cover} />
      </View>
    );
  }

  if (!data) {
    return <ErrorState error={error} message={error instanceof Error ? error.message : `No work found for ${id}`} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
      <View style={styles.header}>
        {data.coverUrl && <Image source={{ uri: data.coverUrl }} style={styles.cover} contentFit="contain" />}
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
      </View>
      <View style={styles.actions}>
        <ShareButton title={data.title} href={routes.work(data.openLibraryWorkId)} />
        <AddToListButton
          member={{ type: "work", id: data.openLibraryWorkId, title: data.title }}
          onSave={async () => {
            // Keeps the cover on disk so the saved work still shows it offline.
            if (data.coverUrl) Image.prefetch(data.coverUrl, "disk");
            return saveWork(data);
          }}
          onChange={() => getSavedWork(data.openLibraryWorkId).then(setSavedRecord)}
        />
      </View>

      <Button
        variant="primary"
        onPress={() => router.push(routes.graph("work", data.openLibraryWorkId))}
        style={styles.graphButton}
        tooltip="See this book's authors, subjects and links as a graph"
      >
        View as Graph
      </Button>
      <Button
        variant="primary"
        onPress={() => router.push(routes.connection(`work:${data.openLibraryWorkId}`, data.title))}
        style={styles.graphButton}
        accessibilityLabel={`Find a connection from ${data.title}`}
        accessibilityHint="Shows how this book links to another book you pick"
        tooltip="Find how this book links to another"
      >
        Find Connection
      </Button>

      <EditionsSection editions={data.editions} highlighted={highlight === "editions"} />

      {savedRecord ? (
        <SavedRecordEditor
          record={savedRecord}
          update={(changes) => updateSavedWork(savedRecord.openLibraryWorkId, changes)}
          onChange={setSavedRecord}
        />
      ) : null}

      {!savedRecord && data.genres.length > 0 && (
        <View style={styles.genresSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Genre</Text>
          <View style={styles.genreTags}>
            {data.genres.map((genre) => (
              <Pressable
                ref={titleRef(`View ${titleCase(genre.label)}`)}
                key={genre.label}
                style={({ pressed }) => [styles.genreTag, pressed && styles.pressed]}
                onPress={() => router.push(routes.subject(slugifySubject(genre.label)))}
                accessibilityRole="button"
                accessibilityLabel={titleCase(genre.label)}
              >
                <Text style={styles.genreTagText}>
                  {titleCase(genre.label)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {data.awards.length > 0 && (
        <View style={styles.genresSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Awards</Text>
          <View style={styles.genreTags}>
            {data.awards.map((award) => (
              <View key={award} style={styles.genreTag}>
                <Text style={styles.genreTagText}>{titleCase(award)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!savedRecord && data.subjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Subjects</Text>
          <View style={styles.subjectTags}>
            {data.subjects.slice(0, 12).map((subject) => (
              <Pressable
                ref={titleRef(`View ${titleCase(subject.label)}`)}
                key={subject.label}
                style={({ pressed }) => [styles.subjectTag, pressed && styles.pressed]}
                onPress={() => router.push(routes.subject(slugifySubject(subject.label)))}
                accessibilityRole="button"
                accessibilityLabel={titleCase(subject.label)}
              >
                <Text style={styles.subjectTagText}>
                  {titleCase(subject.label)}
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
          {data.descriptionSource === "loc" && data.loc && (
            <Pressable onPress={() => Linking.openURL(`https://lccn.loc.gov/${data.loc!.lccn}`)}>
              <Text style={styles.descriptionSource}>via Library of Congress</Text>
            </Pressable>
          )}
        </View>
      )}

      <SeriesSection seriesQid={data.series?.wikidataId} currentWorkId={data.openLibraryWorkId} />
      <MoreByAuthor title="More by this author" works={data.moreByAuthor} />

      <ReviewsSection reviews={data.reviews} />
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, cardStyle, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg, alignItems: "flex-start" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
    cover: { width: 180, height: 260, marginBottom: spacing.lg, borderRadius: 6, backgroundColor: colors.paper, ...cardStyle },
    header: { alignItems: "center", width: "100%" },
    actions: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, width: "100%" },
    title: { fontFamily: fonts.display, fontSize: typeScale.lg, textAlign: "center", letterSpacing: -0.3, color: colors.ink },
    author: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.sm,
      color: colors.cover,
      marginTop: spacing.xs,
      textDecorationLine: "underline",
    },
    genresSection: { marginTop: spacing.xxl, width: "100%" },
    genreTags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    genreTag: {
      backgroundColor: colors.chipBackgroundGenre,
      borderRadius: radii.pill,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.chipTextGenre,
    },
    genreTagText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: typeScale.xs,
      color: colors.chipTextGenre,
    },
    aboutSection: { marginTop: spacing.xxl, width: "100%" },
    descriptionSource: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
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
      borderWidth: 1,
      borderColor: colors.chipTextSubject,
    },
    subjectTagText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: typeScale.xs,
      color: colors.chipTextSubject,
    },
  });
}
