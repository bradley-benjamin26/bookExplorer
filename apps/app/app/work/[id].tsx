import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { WorkSaveButton } from "../../src/components/WorkSaveButton";
import { ShareButton } from "../../src/components/ShareButton";
import { TermsSection } from "../../src/components/TermsSection";
import type { SaveSheetHandle } from "../../src/components/AddToListButton";
import { routes } from "../../src/navigation";
import { savedEditionOf } from "../../src/editionChoice";
import { getAllSavedBooks, type SavedBookRecord } from "../../src/storage/savedBooks";
import { addRecent } from "../../src/storage/history";
import { getSavedWork, seedSavedWorkFromApi, updateSavedWork, type SavedWorkRecord } from "../../src/storage/savedWorks";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
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
  const saveSheet = useRef<SaveSheetHandle>(null);
  // Set when the Subjects & Genres lock asked for the save, so a saved edition opens ready to edit.
  const editAfterSave = useRef(false);

  // Re-read on every focus: this screen stays mounted under others, so an edit
  // or removal on the Saved screen would otherwise not show here.
  // Saved under the id the server returned, in case it differs from the route's.
  const savedId = data?.openLibraryWorkId ?? id;
  useFocusEffect(
    useCallback(() => {
      if (savedId) getSavedWork(savedId).then(setSavedRecord);
    }, [savedId])
  );

  // The edition of this work saved as a book, if any; re-read on focus like the work's own record.
  const [savedEdition, setSavedEdition] = useState<SavedBookRecord | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (savedId) getAllSavedBooks().then((books) => setSavedEdition(savedEditionOf(books, savedId)));
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
            ref={titleRef(`View ${author.name}`)}
            accessibilityRole="button"
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
        <WorkSaveButton
          ref={saveSheet}
          work={data}
          onSaved={(isbn) => {
            const edit = editAfterSave.current;
            editAfterSave.current = false;
            if (isbn) router.push(routes.book(isbn, { edit }));
            else getSavedWork(data.openLibraryWorkId).then(setSavedRecord);
          }}
        />
      </View>
      {savedEdition && (
        <Pressable ref={titleRef("View the saved edition")} accessibilityRole="button" onPress={() => router.push(routes.book(savedEdition.isbn))}>
          <Text style={styles.savedEdition}>Saved: {savedEdition.format ?? "edition"} {savedEdition.isbn}</Text>
        </Pressable>
      )}

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

      <TermsSection
        subjects={savedRecord?.subjects ?? data.subjects.map((t) => t.label)}
        genres={savedRecord?.genres ?? data.genres.map((t) => t.label)}
        awards={data.awards}
        record={savedRecord}
        onUpdate={(c) => updateSavedWork(data.openLibraryWorkId, c).then((r) => r && setSavedRecord(r))}
        onRequestSave={() => {
          editAfterSave.current = true;
          saveSheet.current?.open();
        }}
      />

      {data.description && (
        <View style={styles.aboutSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">About</Text>
          <ExpandableText text={data.description} textStyle={styles.description} viewMoreStyle={styles.viewMore} />
          {data.descriptionSource === "loc" && data.loc && (
            <Pressable ref={titleRef("Read the source at the Library of Congress")} accessibilityRole="link" onPress={() => Linking.openURL(`https://lccn.loc.gov/${data.loc!.lccn}`)}>
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

function createStyles({ colors, cardStyle, spacing, fonts, typeScale }: Theme) {
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
    aboutSection: { marginTop: spacing.xxl, width: "100%" },
    savedEdition: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm, alignSelf: "center", textDecorationLine: "underline" },
    descriptionSource: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
    description: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24 },
    viewMore: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
    graphButton: { width: "100%", marginTop: spacing.lg },
    pressed: { opacity: 0.6 },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
  });
}
