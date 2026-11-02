import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchWork } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { FindLinkRow } from "../../src/components/FindLinkRow";
import { hardcoverUrl, openLibraryWorkUrl } from "../../src/findLinks";
import { Footer } from "../../src/components/Footer";
import { ErrorState } from "../../src/components/ErrorState";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { EditionsSection } from "../../src/components/EditionsSection";
import { AboutSection } from "../../src/components/AboutSection";
import { DetailTop, PRIMARY_ACTION_STYLE } from "../../src/components/DetailTop";
import { DetailSkeleton } from "../../src/components/Skeleton";
import { RatingBadge } from "../../src/components/RatingBadge";
import { HardcoverProgress } from "../../src/components/HardcoverProgress";
import { ReviewsSection } from "../../src/components/ReviewsSection";
import { SavedRecordEditor } from "../../src/components/SavedRecordEditor";
import { MoreByAuthor, SeriesSection } from "../../src/components/WorkListSections";
import { WorkSaveButton } from "../../src/components/WorkSaveButton";
import { ShareButton } from "../../src/components/ShareButton";
import { AwardsSection, EditLinkRow, TermsSection } from "../../src/components/TermsSection";
import type { SaveSheetHandle } from "../../src/components/AddToListButton";
import { routes } from "../../src/navigation";
import { savedEditionOf } from "../../src/editionChoice";
import { getAllSavedBooks, type SavedBookRecord } from "../../src/storage/savedBooks";
import { addRecent } from "../../src/storage/history";
import { getSavedWork, seedSavedWorkFromApi, updateSavedWork, type SavedWorkRecord } from "../../src/storage/savedWorks";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import { editLinkHost } from "../../src/termsEditHost";
import { useEditLock } from "../../src/useEditLock";
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
    if (data) addRecent({ kind: "work", id: data.openLibraryWorkId, title: data.title, subtitle: data.authors.map((a) => a.name).join(", ") || null, coverUrl: data.coverUrl });
  }, [data]);

  // Saved exactly when it has a saved record, as on the book page.
  const [savedRecord, setSavedRecord] = useState<SavedWorkRecord | null>(null);
  const saveSheet = useRef<SaveSheetHandle>(null);
  // Set when Edit asked for the save, so a saved edition opens ready to edit.
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

  const lock = useEditLock({
    record: savedRecord,
    onUpdate: (c) => updateSavedWork(savedId, c).then((r) => r && setSavedRecord(r)),
    onRequestSave: (notice) => {
      // Already saved as an edition: edit it on its book page instead of asking to save again.
      if (savedEdition) return router.push(routes.book(savedEdition.isbn, { edit: true }));
      editAfterSave.current = true;
      saveSheet.current?.open(notice);
    },
  });

  // A record from the migration or a v1 import starts blank; give it the API's tags once they load.
  useEffect(() => {
    if (data && savedRecord) seedSavedWorkFromApi(savedRecord.openLibraryWorkId, data).then((r) => r && setSavedRecord(r));
  }, [data, savedRecord]);

  if (isLoading) return <DetailSkeleton />;

  if (!data) {
    return <ErrorState error={error} message={error instanceof Error ? error.message : `No work found for ${id}`} />;
  }

  const genreLabels = lock.unlocked ? lock.draft.genres : savedRecord?.genres ?? data.genres.map((t) => t.label);
  const subjectLabels = lock.unlocked ? lock.draft.subjects : savedRecord?.subjects ?? data.subjects.map((t) => t.label);
  const host = editLinkHost(genreLabels, subjectLabels, lock.unlocked);
  const editLink = { label: lock.unlocked ? ("Save" as const) : ("Edit" as const), onPress: lock.toggle };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
      <DetailTop
        image={data.coverUrl ? <Image source={{ uri: data.coverUrl }} style={styles.cover} contentFit="contain" /> : undefined}
        title={data.title}
        primaryActions={
          (
            <>
              <Button
                variant="primary"
                style={PRIMARY_ACTION_STYLE}
                onPress={() => router.push(routes.graph("work", data.openLibraryWorkId))}
                tooltip="See this book's authors, subjects and links as a graph"
              >
                View as graph
              </Button>
              <Button
                variant="primary"
                style={PRIMARY_ACTION_STYLE}
                onPress={() => router.push(routes.connection(`work:${data.openLibraryWorkId}`, data.title))}
                accessibilityLabel={`Find a connection from ${data.title}`}
                accessibilityHint="Shows how this book links to another book you pick"
                tooltip="Find how this book links to another"
              >
                Find connection
              </Button>
            </>
          )
        }
        actions={
          <>
            <WorkSaveButton
              ref={saveSheet}
              work={data}
              saved={!!savedRecord || !!savedEdition}
              onSaved={(isbn) => {
                const edit = editAfterSave.current;
                editAfterSave.current = false;
                if (isbn) router.push(routes.book(isbn, { edit }));
                else getSavedWork(data.openLibraryWorkId).then(setSavedRecord);
              }}
            />
            <ShareButton title={data.title} href={routes.work(data.openLibraryWorkId)} />
          </>
        }
      >
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
        <HardcoverProgress type="work" id={data.openLibraryWorkId} />
      </DetailTop>
      {lock.error && <Text style={styles.lockError}>{lock.error}</Text>}
      {savedEdition && (
        <Pressable ref={titleRef("View the saved edition")} accessibilityRole="button" style={styles.savedEditionLink} onPress={() => router.push(routes.book(savedEdition.isbn))}>
          <Text style={styles.savedEdition}>Saved: {savedEdition.format ?? "edition"} {savedEdition.isbn}</Text>
        </Pressable>
      )}

      {data.description && (
        <AboutSection
          text={data.description}
          credit={
            data.descriptionSource === "loc" && data.loc ? (
              <Pressable ref={titleRef("Read the source at the Library of Congress")} accessibilityRole="link" onPress={() => Linking.openURL(`https://lccn.loc.gov/${data.loc!.lccn}`)}>
                <Text style={styles.descriptionSource}>via Library of Congress</Text>
              </Pressable>
            ) : undefined
          }
        />
      )}

      <EditionsSection editions={data.editions} highlighted={highlight === "editions"} />

      {host === "standalone" && <EditLinkRow editLink={editLink} />}
      <TermsSection
        kind="genres"
        labels={genreLabels}
        unlocked={lock.unlocked}
        onEdit={(change) => lock.edit("genres", change)}
        editLink={host === "genres" ? editLink : undefined}
      />
      <TermsSection
        kind="subjects"
        labels={subjectLabels}
        unlocked={lock.unlocked}
        onEdit={(change) => lock.edit("subjects", change)}
        editLink={host === "subjects" ? editLink : undefined}
        tagged={data.subjects}
      />
      <AwardsSection awards={data.awards} />

      {lock.unlocked && savedRecord ? (
        <SavedRecordEditor
          record={savedRecord}
          update={(changes) => updateSavedWork(savedRecord.openLibraryWorkId, changes)}
          onChange={setSavedRecord}
        />
      ) : savedRecord?.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Your Notes</Text>
          <Text style={styles.notes}>{savedRecord.notes}</Text>
        </View>
      ) : null}

      <SeriesSection seriesQid={data.series?.wikidataId} currentWorkId={data.openLibraryWorkId} />
      <MoreByAuthor title="More by this author" works={data.moreByAuthor} />

      <View style={styles.findSection}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Find this book</Text>
        <FindLinkRow label="View on Open Library" url={openLibraryWorkUrl(data.openLibraryWorkId)} />
        <FindLinkRow label="View on Hardcover" url={hardcoverUrl(data.hardcoverSlug, data.title)} />
      </View>

      <ReviewsSection reviews={data.reviews} />
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, radii, cardStyle, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg, alignItems: "flex-start" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
    cover: { width: 180, height: 260, marginBottom: spacing.lg, borderRadius: radii.sm, backgroundColor: colors.paper, ...cardStyle },
    author: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.sm,
      color: colors.cover,
      marginTop: spacing.xs,
      textDecorationLine: "underline",
    },
    savedEdition: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, textDecorationLine: "underline" },
    savedEditionLink: { marginTop: spacing.sm, alignSelf: "center" },
    descriptionSource: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
    pressed: { opacity: 0.6 },
    lockError: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.sm, alignSelf: "center" },
    section: { marginTop: spacing.xxl, width: "100%" },
    findSection: { marginTop: spacing.xxl, width: "100%" },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    notes: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24 },
  });
}
