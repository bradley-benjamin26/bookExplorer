import { useQuery } from "@tanstack/react-query";
import { slugifySubject } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchBookByIsbn } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { ErrorState } from "../../src/components/ErrorState";
import { ExpandableText } from "../../src/components/ExpandableText";
import { GoogleBooksAttribution } from "../../src/components/GoogleBooksAttribution";
import { LibraryFindLinks } from "../../src/components/LibraryFindLinks";
import { RatingBadge } from "../../src/components/RatingBadge";
import { ReviewsSection } from "../../src/components/ReviewsSection";
import { routes } from "../../src/navigation";
import { addRecentIsbn } from "../../src/storage/history";
import { getSavedBook, removeSavedBook, saveBookFromApi, type SavedBookRecord } from "../../src/storage/savedBooks";
import { toggleSaved } from "../../src/storage/savedItems";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

const BOOKSHOP_URL = "https://bookshop.org/beta-search?keywords=";
const WORLDCAT_URL = "https://search.worldcat.org/search?q=bn%3A";
const OPEN_LIBRARY_URL = "https://openlibrary.org/isbn/";

export default function BookDetail() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["book", isbn],
    queryFn: () => fetchBookByIsbn(isbn),
    enabled: !!isbn,
  });

  // A book's "saved" state is exactly whether it has a saved record — the
  // two are set together everywhere below, so there's no need for a second,
  // separately-tracked boolean that could drift out of sync with this one.
  const [savedRecord, setSavedRecord] = useState<SavedBookRecord | null>(null);
  const saved = savedRecord !== null;

  useEffect(() => {
    if (data) addRecentIsbn(data.isbn);
    if (isbn) getSavedBook(isbn).then(setSavedRecord);
  }, [data, isbn]);

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
  const displaySubjects = savedRecord?.subjects ?? data?.subjects ?? [];
  const displayGenres = savedRecord?.genres ?? data?.genres ?? [];

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }

  if (isError || !data) {
    return <ErrorState message={error instanceof Error ? error.message : `No book found for ISBN ${isbn}`} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.coverUrl && <Image source={{ uri: data.coverUrl }} style={styles.cover} resizeMode="contain" />}
      {/* When the description is also from Google Books, that credit alone covers the cover too, so this is skipped. */}
      {data.coverSource === "googleBooks" && data.descriptionSource !== "googleBooks" && (
        <GoogleBooksAttribution label="Cover image" />
      )}
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
      {savedRecord && (
        <Pressable style={({ pressed }) => pressed && styles.pressed} onPress={() => router.push(routes.saved())}>
          <Text style={styles.editInLibraryLink}>Edit subjects, genres & notes in My Library</Text>
        </Pressable>
      )}

      {(data.format || displayGenres.length > 0) && (
        <View style={styles.metaRow}>
          {data.format && (
            <View style={styles.metaColumn}>
              <Text style={styles.sectionTitle}>Format</Text>
              <View style={styles.genreTags}>
                <View style={styles.formatTag}>
                  <Text style={styles.formatTagText}>{data.format}</Text>
                </View>
              </View>
            </View>
          )}

          {displayGenres.length > 0 && (
            <View style={styles.metaColumn}>
              <Text style={styles.sectionTitle}>Genre</Text>
              <View style={styles.genreTags}>
                {displayGenres.map((genre) => (
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
        </View>
      )}

      {displaySubjects.length > 0 && (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle}>Subjects</Text>
          <View style={styles.subjectTags}>
            {displaySubjects.slice(0, 12).map((subject) => (
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

      {savedRecord?.notes ? (
        <View style={styles.subjectsSection}>
          <Text style={styles.sectionTitle}>Your Notes</Text>
          <Text style={styles.description}>{savedRecord.notes}</Text>
        </View>
      ) : null}

      {data.openLibraryWorkId && (
        <Button
          variant="primary"
          onPress={() => router.push(routes.graph("work", data.openLibraryWorkId!))}
          style={styles.graphButton}
        >
          View as Graph
        </Button>
      )}

      <View style={styles.findSection}>
        <Text style={styles.sectionTitle}>Find This Book</Text>
        <Pressable
          style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
          onPress={() => Linking.openURL(`${OPEN_LIBRARY_URL}${data.isbn}`)}
        >
          <Text style={styles.findRowText}>View on Open Library</Text>
          <Text style={styles.findRowChevron}>›</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
          onPress={() => Linking.openURL(`${BOOKSHOP_URL}${data.isbn}`)}
        >
          <Text style={styles.findRowText}>Search on Bookshop.org</Text>
          <Text style={styles.findRowChevron}>›</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
          onPress={() => Linking.openURL(`${WORLDCAT_URL}${data.isbn}`)}
        >
          <Text style={styles.findRowText}>Search on WorldCat</Text>
          <Text style={styles.findRowChevron}>›</Text>
        </Pressable>
        <LibraryFindLinks isbn={data.isbn} title={data.title} />
      </View>

      {data.description && (
        <View style={styles.aboutSection}>
          <Text style={styles.sectionTitle}>About</Text>
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

function createStyles({ colors, kicker, cardStyle }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, alignItems: "center" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    cover: { width: 180, height: 260, marginBottom: 20, borderRadius: 6, backgroundColor: colors.background, ...cardStyle },
    title: { fontSize: 25, fontWeight: "700", textAlign: "center", letterSpacing: -0.3, color: colors.text },
    author: { fontSize: 17, color: colors.link, marginTop: 4, textDecorationLine: "underline" },
    saveButton: { marginTop: 14 },
    editInLibraryLink: { fontSize: 13, color: colors.link, marginTop: 10, textDecorationLine: "underline" },
    // Format and Genre are two distinct labeled sections (different
    // headings, different tag styling) rather than tags sharing one row —
    // but stacking each in its own full-width block wasted vertical space
    // when Format is just a single short tag, so they sit side by side in
    // one row instead, each keeping its own heading. `flexWrap` lets Genre's
    // tags fall to a second line under its own heading if the row gets too
    // narrow, without disturbing Format's column.
    metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 28, width: "100%", justifyContent: "center", gap: 24 },
    metaColumn: { alignItems: "center" },
    genreTags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
    genreTag: { backgroundColor: colors.chipBackgroundGenre, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 7 },
    genreTagText: { fontSize: 13, fontWeight: "600", color: colors.chipTextGenre },
    // A format tag isn't a link to anywhere (there's no "format" browse page
    // the way there is for a genre/subject) — an outlined, neutral style
    // instead of the genre tags' filled pink signals that difference
    // without a caption.
    formatTag: {
      backgroundColor: colors.chipBackground,
      borderRadius: 16,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    formatTagText: { fontSize: 13, fontWeight: "600", color: colors.text, textTransform: "capitalize" },
    aboutSection: { marginTop: 28, width: "100%" },
    description: { fontSize: 15, color: colors.text, lineHeight: 22 },
    viewMore: { fontSize: 13, fontWeight: "600", color: colors.link, marginTop: 6 },
    descriptionSource: { fontSize: 12, color: colors.link, marginTop: 6 },
    findSection: { marginTop: 28, width: "100%" },
    findRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    findRowText: { fontSize: 16, color: colors.link },
    findRowChevron: { fontSize: 18, color: colors.textFaint, fontWeight: "600" },
    findRowHint: { fontSize: 13, color: colors.textFaint, fontStyle: "italic" },
    graphButton: { width: "100%", marginTop: 20 },
    pressed: { opacity: 0.6 },
    subjectsSection: { marginTop: 28, width: "100%" },
    sectionTitle: { ...kicker, marginBottom: 12 },
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
