import { useQuery } from "@tanstack/react-query";
import { normalizeIsbn, slugifySubject, type TaggedTerm } from "@book-explorer/shared";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { fetchBookWithAlternate } from "../../src/api/bookLookup";
import { Button } from "../../src/components/Button";
import { ErrorState } from "../../src/components/ErrorState";
import { ExpandableText } from "../../src/components/ExpandableText";
import { GoogleBooksAttribution } from "../../src/components/GoogleBooksAttribution";
import { LibraryFindLinks } from "../../src/components/LibraryFindLinks";
import { RatingBadge } from "../../src/components/RatingBadge";
import { ReviewsSection } from "../../src/components/ReviewsSection";
import { SourceBadge } from "../../src/components/SourceBadge";
import { ShareButton } from "../../src/components/ShareButton";
import { routes } from "../../src/navigation";
import { openLibraryUrl } from "../../src/share";
import { addRecentIsbn } from "../../src/storage/history";
import { getSavedBook, removeSavedBook, saveBookFromApi, type SavedBookRecord } from "../../src/storage/savedBooks";
import { toggleSaved } from "../../src/storage/savedItems";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import { titleCase } from "../../src/titleCase";

const BOOKSHOP_URL = "https://bookshop.org/beta-search?keywords=";
const WORLDCAT_URL = "https://search.worldcat.org/search?q=bn%3A";
const OPEN_LIBRARY_URL = "https://openlibrary.org/isbn/";

export default function BookDetail() {
  const { isbn: rawIsbn } = useLocalSearchParams<{ isbn: string }>();
  // A typed or pasted ISBN may be hyphenated, but the server returns (and a
  // saved record is keyed by) the bare-digit form — normalizing the route
  // param keeps the saved-record lookup below, and the query cache key, on
  // that same form. Junk with no digits at all is passed through untouched
  // so the server's own 400 surfaces as an error instead of an empty page.
  const isbn = rawIsbn ? normalizeIsbn(rawIsbn) || rawIsbn : rawIsbn;
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["book", isbn],
    queryFn: () => fetchBookWithAlternate(isbn),
    enabled: !!isbn,
  });

  // A book's "saved" state is exactly whether it has a saved record — the
  // two are set together everywhere below, so there's no need for a second,
  // separately-tracked boolean that could drift out of sync with this one.
  const [savedRecord, setSavedRecord] = useState<SavedBookRecord | null>(null);
  const saved = savedRecord !== null;

  useEffect(() => {
    if (data) addRecentIsbn(data.isbn);
  }, [data]);

  // Re-read on every focus, not just on first load — this screen stays
  // mounted underneath others in the stack, so a book removed (or edited)
  // from the Saved screen would otherwise still show its old saved state
  // when navigating back here.
  useFocusEffect(
    useCallback(() => {
      if (isbn) getSavedBook(isbn).then(setSavedRecord);
    }, [isbn])
  );

  const handleToggleSaved = async () => {
    if (!data) return;
    const nowSaved = await toggleSaved({ type: "book", id: data.isbn, title: data.title });
    if (nowSaved) {
      setSavedRecord(await saveBookFromApi(data));
    } else {
      await removeSavedBook(data.isbn);
      setSavedRecord(null);
    }
  };

  // Once a book is saved, its own record (subjects/genres the user has
  // edited, on top of the snapshot taken at save time) is what's shown and
  // edited from here on, rather than whatever the external sources return
  // on this fetch — that's the whole point of saving a book's data locally.
  const displaySubjects: TaggedTerm[] = savedRecord
    ? savedRecord.subjects.map((label) => ({ label, sources: [] }))
    : (data?.subjects ?? []);
  const displayGenres: TaggedTerm[] = savedRecord
    ? savedRecord.genres.map((label) => ({ label, sources: [] }))
    : (data?.genres ?? []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.cover} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : `No book found for ISBN ${isbn}`}
        action={
          error instanceof ApiError && error.status === 404
            ? { label: "Search by title instead", onPress: () => router.push(routes.search(isbn)) }
            : undefined
        }
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.coverUrl && <Image source={{ uri: data.coverUrl }} style={styles.cover} resizeMode="contain" />}
      {/* When the description is also from Google Books, that credit alone covers the cover too, so this is skipped. */}
      {data.coverSource === "googleBooks" && data.descriptionSource !== "googleBooks" && (
        <GoogleBooksAttribution label="Cover image" />
      )}
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
        onPress={handleToggleSaved}
        style={[styles.saveButton, saved && styles.savedPill]}
        textStyle={[styles.saveText, saved && styles.savedText]}
        accessibilityLabel={saved ? "Saved" : "Save"}
      >
        {saved ? "★ Saved" : "☆ Save"}
      </Button>
      <ShareButton title={data.title} href={routes.book(data.isbn)} publicUrl={openLibraryUrl.book(data.isbn)} />
      {savedRecord && (
        <Pressable style={({ pressed }) => pressed && styles.pressed} onPress={() => router.push(routes.saved())}>
          <Text style={styles.editInLibraryLink}>Edit subjects, genres & notes in My Library</Text>
        </Pressable>
      )}

      {(data.format || displayGenres.length > 0) && (
        <View style={styles.metaRow}>
          {data.format && (
            <View style={styles.metaColumn}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Format</Text>
              <View style={styles.genreTags}>
                <View style={styles.formatTag}>
                  <Text style={styles.formatTagText}>{data.format}</Text>
                </View>
              </View>
            </View>
          )}

          {displayGenres.length > 0 && (
            <View style={styles.metaColumn}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Genre</Text>
              <View style={styles.genreTags}>
                {displayGenres.map((genre) => (
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
        </View>
      )}

      {displaySubjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Subjects</Text>
          <View style={styles.subjectTags}>
            {displaySubjects.slice(0, 12).map((subject) => (
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

      {savedRecord?.notes ? (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Your Notes</Text>
          <Text style={styles.description}>{savedRecord.notes}</Text>
        </View>
      ) : null}

      {data.openLibraryWorkId && (
        <Button
          variant="primary"
          onPress={() => router.push(routes.graph("work", data.openLibraryWorkId!))}
          style={styles.graphButton}
          textStyle={styles.graphButtonText}
        >
          View as Graph
        </Button>
      )}

      <View style={styles.findSection}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Find This Book</Text>
        <Pressable
          style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
          onPress={() => Linking.openURL(`${OPEN_LIBRARY_URL}${data.isbn}`)}
          accessibilityRole="button"
          accessibilityLabel="View on Open Library"
        >
          <Text style={styles.findRowText}>View on Open Library</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronRight size={18} color={theme.colors.inkFaint} />
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
          onPress={() => Linking.openURL(`${BOOKSHOP_URL}${data.isbn}`)}
          accessibilityRole="button"
          accessibilityLabel="Search on Bookshop.org"
        >
          <Text style={styles.findRowText}>Search on Bookshop.org</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronRight size={18} color={theme.colors.inkFaint} />
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
          onPress={() => Linking.openURL(`${WORLDCAT_URL}${data.isbn}`)}
          accessibilityRole="button"
          accessibilityLabel="Search on WorldCat"
        >
          <Text style={styles.findRowText}>Search on WorldCat</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronRight size={18} color={theme.colors.inkFaint} />
          </View>
        </Pressable>
        <LibraryFindLinks isbn={data.isbn} title={data.title} />
      </View>

      {data.description && (
        <View style={styles.aboutSection}>
          <Text style={styles.sectionTitle} accessibilityRole="header">About</Text>
          <ExpandableText text={data.description} textStyle={styles.description} viewMoreStyle={styles.viewMore} />
          {/* Wikipedia and Google Books content require attribution on reuse. */}
          {data.descriptionSource === "wikipedia" && data.descriptionSourceUrl ? (
            <Pressable onPress={() => Linking.openURL(data.descriptionSourceUrl!)}>
              <Text style={styles.descriptionSource}>via Wikipedia</Text>
            </Pressable>
          ) : data.descriptionSource === "googleBooks" ? (
            <GoogleBooksAttribution
              label={data.coverSource === "googleBooks" ? "Description, Cover image" : "Description"}
            />
          ) : null}
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
    // Overrides the pill's yellow active fill: marginalia text on it is only 4.07:1 in dark mode.
    savedPill: { backgroundColor: colors.chipBackground },
    saveText: { fontFamily: fonts.bodySemiBold, color: colors.ink },
    savedText: { color: colors.marginalia },
    editInLibraryLink: {
      fontFamily: fonts.body,
      fontSize: typeScale.xs,
      color: colors.cover,
      marginTop: spacing.sm,
      textDecorationLine: "underline",
    },
    // Format and Genre are two distinct labeled sections (different
    // headings, different tag styling) rather than tags sharing one row —
    // but stacking each in its own full-width block wasted vertical space
    // when Format is just a single short tag, so they sit side by side in
    // one row instead, each keeping its own heading. `flexWrap` lets Genre's
    // tags fall to a second line under its own heading if the row gets too
    // narrow, without disturbing Format's column.
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: spacing.xxl,
      width: "100%",
      justifyContent: "flex-start",
      gap: spacing.xl,
    },
    // flexShrink lets a long genre list wrap within the row instead of running off the right edge.
    metaColumn: { alignItems: "flex-start", flexShrink: 1 },
    genreTags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: spacing.sm },
    genreTag: { backgroundColor: colors.chipBackgroundGenre, borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 7 },
    genreTagText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.chipTextGenre },
    // A format tag isn't a link to anywhere (there's no "format" browse page
    // the way there is for a genre/subject) — an outlined, neutral style
    // instead of the genre tags' filled pink signals that difference
    // without a caption.
    formatTag: {
      backgroundColor: colors.chipBackground,
      borderRadius: radii.pill,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    formatTagText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.ink, textTransform: "capitalize" },
    aboutSection: { marginTop: spacing.xxl, width: "100%" },
    description: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24 },
    viewMore: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
    descriptionSource: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
    findSection: { marginTop: spacing.xxl, width: "100%" },
    findRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    findRowText: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.cover },
    graphButton: { width: "100%", marginTop: spacing.lg, backgroundColor: colors.cover },
    graphButtonText: { fontFamily: fonts.bodySemiBold, color: colors.paper },
    pressed: { opacity: 0.6 },
    subjectsSection: { marginTop: spacing.xxl, width: "100%" },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
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
    subjectTagText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.chipTextSubject },
  });
}
