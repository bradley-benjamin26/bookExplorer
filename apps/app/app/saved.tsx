import { useFocusEffect, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BackupSection } from "../src/components/BackupSection";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { RecommendationsSection } from "../src/components/RecommendationsSection";
import { SavedRecordEditor } from "../src/components/SavedRecordEditor";
import { routes } from "../src/navigation";
import {
  generateLibraryId,
  getLibraries,
  removeLibrary as removeStoredLibrary,
  upsertLibrary,
  type Library,
} from "../src/storage/librarySettings";
import { getSavedBook, unsaveBook, updateSavedBook, type SavedBookRecord } from "../src/storage/savedBooks";
import { getSavedWork, unsaveWork, updateSavedWork, type SavedWorkChanges, type SavedWorkRecord } from "../src/storage/savedWorks";
import { stamp, type Unversioned } from "../src/storage/schema";
import { getSavedItems, removeSaved, type SavedItem } from "../src/storage/savedItems";
import { useTheme, useThemedStyles, useThemePreference, type Theme } from "../src/theme";
import type { ThemePreference } from "../src/storage/themePreference";

function LibraryCard({
  library,
  onSave,
  onRemove,
}: {
  library: Library;
  onSave: (library: Unversioned<Library>) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState(library.name);
  const [isbnUrl, setIsbnUrl] = useState(library.isbnUrl);
  const [titleUrl, setTitleUrl] = useState(library.titleUrl);
  const [saved, setSaved] = useState(false);
  // The stored library changed under the card (a save, or an import): show the stored values,
  // so pressing Save can't write the card's stale ones over an import.
  const [shownUpdatedAt, setShownUpdatedAt] = useState(library.updatedAt);
  if (library.updatedAt !== shownUpdatedAt) {
    setShownUpdatedAt(library.updatedAt);
    setName(library.name);
    setIsbnUrl(library.isbnUrl);
    setTitleUrl(library.titleUrl);
  }

  const markDirty = () => setSaved(false);

  return (
    <View style={styles.libraryCard}>
      <View style={styles.libraryCardHeader}>
        <Text style={styles.fieldLabel}>Library Name</Text>
        <Pressable
          onPress={() => onRemove(library.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={library.name ? `Remove ${library.name}` : "Remove library"}
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        placeholder="e.g. Springfield Public Library"
        placeholderTextColor={theme.colors.inkFaint}
        value={name}
        onChangeText={(text) => {
          setName(text);
          markDirty();
        }}
      />

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Search by ISBN</Text>
      <Text style={styles.helpText}>
        Paste the catalog's search URL from searching an ISBN there once. Use {"{isbn}"} as a placeholder if the
        ISBN isn't at the very end of the URL.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="https://catalog.mylibrary.org/search?q="
        placeholderTextColor={theme.colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        value={isbnUrl}
        onChangeText={(text) => {
          setIsbnUrl(text);
          markDirty();
        }}
      />

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Search by Title</Text>
      <Text style={styles.helpText}>
        Paste the catalog's search URL from searching a book title there once. Use {"{title}"} as a placeholder if
        the title isn't at the very end of the URL.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="https://catalog.mylibrary.org/search?q="
        placeholderTextColor={theme.colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        value={titleUrl}
        onChangeText={(text) => {
          setTitleUrl(text);
          markDirty();
        }}
      />

      <Button
        variant="primary"
        onPress={async () => {
          await onSave({ id: library.id, name: name.trim(), isbnUrl: isbnUrl.trim(), titleUrl: titleUrl.trim() });
          setSaved(true);
        }}
        style={styles.saveButton}
      >
        {saved ? "Saved" : "Save"}
      </Button>
    </View>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Standard" },
  { value: "dark", label: "Dark" },
];

function AppearanceSection() {
  const styles = useThemedStyles(createStyles);
  const { preference, setPreference } = useThemePreference();

  return (
    <View>
      <Text style={styles.sectionTitle} accessibilityRole="header">Appearance</Text>
      <View style={styles.themeOptions}>
        {THEME_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant="pill"
            active={preference === option.value}
            onPress={() => setPreference(option.value)}
            style={styles.themeOption}
          >
            {option.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

function BookRow({ item, onRemove }: { item: SavedItem; onRemove: (item: SavedItem) => void }) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [expanded, setExpanded] = useState(false);
  const [record, setRecord] = useState<SavedBookRecord | SavedWorkRecord | null>(null);

  // Books (by ISBN) and works (by work id) each have an editable record.
  const editable = item.type === "book" || item.type === "work";
  const update = (changes: SavedWorkChanges) =>
    item.type === "work" ? updateSavedWork(item.id, changes) : updateSavedBook(item.id, changes);

  const handleToggleExpand = () => {
    if (!expanded && !record) {
      (item.type === "work" ? getSavedWork(item.id) : getSavedBook(item.id)).then(setRecord);
    }
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.bookBlock}>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
          onPress={() => router.push(item.type === "work" ? routes.work(item.id) : routes.book(item.id))}
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <Text style={styles.rowText} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
        {editable && (
          <Pressable
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            onPress={handleToggleExpand}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={expanded ? `Done editing ${item.title}` : `Edit ${item.title}`}
          >
            <Text style={styles.editText}>{expanded ? "Done" : "Edit"}</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          onPress={() => onRemove(item)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.title}`}
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
      {expanded && editable && (record ? <SavedRecordEditor record={record} update={update} onChange={setRecord} /> : null)}
    </View>
  );
}

export default function Saved() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);

  const load = useCallback(() => {
    getSavedItems().then(setItems);
    getLibraries().then(setLibraries);
  }, []);
  useFocusEffect(load);

  const books = items.filter((i) => i.type === "book" || i.type === "work");
  const authors = items.filter((i) => i.type === "author");

  const handleRemove = async (item: SavedItem) => {
    // A book's or work's editable record (tags, notes) lives under its own key — left
    // behind, its page would still show it as saved, and saving it
    // again would resurrect the old notes instead of starting fresh.
    if (item.type === "work") await unsaveWork(item.id);
    else if (item.type === "book") await unsaveBook(item.id);
    else await removeSaved(item.type, item.id);
    setItems((prev) => prev.filter((i) => !(i.type === item.type && i.id === item.id)));
  };

  const handleAddLibrary = () => {
    setLibraries((prev) => [...prev, stamp({ id: generateLibraryId(), name: "", isbnUrl: "", titleUrl: "" })]);
  };

  const handleSaveLibrary = async (library: Unversioned<Library>) => {
    const next = await upsertLibrary(library);
    setLibraries(next);
  };

  const handleRemoveLibrary = async (id: string) => {
    const next = await removeStoredLibrary(id);
    setLibraries(next);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle} accessibilityRole="header">Saved Books{books.length > 0 ? ` (${books.length})` : ""}</Text>
      {books.length === 0 ? (
        <Text style={styles.emptyText}>No saved books yet — tap "Save" on a book page to add one.</Text>
      ) : (
        books.map((item) => <BookRow key={`${item.type}:${item.id}`} item={item} onRemove={handleRemove} />)
      )}

      <Text style={styles.sectionTitle} accessibilityRole="header">Saved Authors{authors.length > 0 ? ` (${authors.length})` : ""}</Text>
      {authors.length === 0 ? (
        <Text style={styles.emptyText}>No saved authors yet — tap "Save" on an author page to add one.</Text>
      ) : (
        authors.map((item) => (
          <View key={item.id} style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
              onPress={() => router.push(routes.author(item.id))}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <Text style={styles.rowText} numberOfLines={2}>
                {item.title}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
              onPress={() => handleRemove(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.title}`}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}

      <RecommendationsSection refreshKey={items} />

      <AppearanceSection />

      <Text style={styles.sectionTitle} accessibilityRole="header">Libraries</Text>
      <Text style={styles.helpText}>
        Book pages can link out to a library catalog's search — configure more than one if you use several (a public
        library and a school library, say). ISBN search is more precise, but not every catalog indexes ISBNs well —
        title search is a useful fallback, so each has its own link, configured separately.
      </Text>

      {libraries.map((library) => (
        <LibraryCard key={library.id} library={library} onSave={handleSaveLibrary} onRemove={handleRemoveLibrary} />
      ))}

      <Pressable
        style={({ pressed }) => [styles.addLibraryRow, pressed && styles.pressed]}
        onPress={handleAddLibrary}
        accessibilityRole="button"
        accessibilityLabel="Add new library"
      >
        <View style={styles.addLibraryIcon}>
          <Plus size={16} color={theme.colors.cover} strokeWidth={2} />
        </View>
        <Text style={styles.addLibraryText}>Add new library</Text>
      </Pressable>

      <BackupSection onImported={load} />
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
    sectionTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: typeScale.md,
      color: colors.ink,
      marginTop: spacing.xxl,
      marginBottom: spacing.md,
    },
    emptyText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, fontStyle: "italic" },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowMain: { flex: 1, paddingRight: spacing.md },
    rowText: { fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    bookBlock: { borderBottomWidth: 1, borderBottomColor: colors.border },
    editButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: colors.chipBackground, marginRight: spacing.sm },
    editText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.ink },
    removeButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: colors.dangerBackground },
    removeText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.danger },
    pressed: { opacity: 0.6 },
    helpText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, lineHeight: 20, marginBottom: spacing.md },
    themeOptions: { flexDirection: "row", gap: spacing.sm },
    themeOption: { alignSelf: "auto" },
    fieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink, marginBottom: spacing.xs },
    fieldLabelSpaced: { marginTop: spacing.lg },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: 14,
      paddingVertical: spacing.md,
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      color: colors.ink,
    },
    saveButton: { marginTop: spacing.md },
    libraryCard: {
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radii.sm,
    },
    libraryCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    addLibraryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: spacing.lg,
      paddingVertical: 10,
    },
    addLibraryIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.cover,
      alignItems: "center",
      justifyContent: "center",
    },
    addLibraryText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.cover },
  });
}
