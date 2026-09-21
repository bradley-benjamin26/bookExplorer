import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../src/components/Button";
import { SavedBookEditor } from "../src/components/SavedBookEditor";
import { routes } from "../src/navigation";
import {
  generateLibraryId,
  getLibraries,
  removeLibrary as removeStoredLibrary,
  upsertLibrary,
  type Library,
} from "../src/storage/librarySettings";
import { getSavedBook, type SavedBookRecord } from "../src/storage/savedBooks";
import { getSavedItems, removeSaved, type SavedItem } from "../src/storage/savedItems";
import { useTheme, useThemedStyles, useThemePreference, type Theme } from "../src/theme";
import type { ThemePreference } from "../src/storage/themePreference";

function LibraryCard({
  library,
  onSave,
  onRemove,
}: {
  library: Library;
  onSave: (library: Library) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState(library.name);
  const [isbnUrl, setIsbnUrl] = useState(library.isbnUrl);
  const [titleUrl, setTitleUrl] = useState(library.titleUrl);
  const [saved, setSaved] = useState(false);

  const markDirty = () => setSaved(false);

  return (
    <View style={styles.libraryCard}>
      <View style={styles.libraryCardHeader}>
        <Text style={styles.fieldLabel}>Library Name</Text>
        <Pressable onPress={() => onRemove(library.id)} hitSlop={8}>
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        placeholder="e.g. Springfield Public Library"
        placeholderTextColor={theme.colors.textFaint}
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
        placeholderTextColor={theme.colors.textFaint}
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
        placeholderTextColor={theme.colors.textFaint}
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
      <Text style={styles.sectionTitle}>Appearance</Text>
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
  const [record, setRecord] = useState<SavedBookRecord | null>(null);

  // Only a "book" item (keyed by ISBN) has an editable record — a saved
  // "work" has nowhere to snapshot subjects/genres from (Open Library's
  // work-level data has no single edition's worth of metadata to seed it
  // with), so it's shown but not editable.
  const editable = item.type === "book";

  const handleToggleExpand = () => {
    if (!expanded && !record) {
      getSavedBook(item.id).then(setRecord);
    }
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.bookBlock}>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
          onPress={() => router.push(item.type === "work" ? routes.work(item.id) : routes.book(item.id))}
        >
          <Text style={styles.rowText} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
        {editable && (
          <Pressable style={({ pressed }) => [styles.editButton, pressed && styles.pressed]} onPress={handleToggleExpand} hitSlop={8}>
            <Text style={styles.editText}>{expanded ? "Done" : "Edit"}</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          onPress={() => onRemove(item)}
          hitSlop={8}
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
      {expanded && editable && (record ? <SavedBookEditor record={record} onChange={setRecord} /> : null)}
    </View>
  );
}

export default function Saved() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);

  useFocusEffect(
    useCallback(() => {
      getSavedItems().then(setItems);
      getLibraries().then(setLibraries);
    }, [])
  );

  const books = items.filter((i) => i.type === "book" || i.type === "work");
  const authors = items.filter((i) => i.type === "author");

  const handleRemove = async (item: SavedItem) => {
    await removeSaved(item.type, item.id);
    setItems((prev) => prev.filter((i) => !(i.type === item.type && i.id === item.id)));
  };

  const handleAddLibrary = () => {
    setLibraries((prev) => [...prev, { id: generateLibraryId(), name: "", isbnUrl: "", titleUrl: "" }]);
  };

  const handleSaveLibrary = async (library: Library) => {
    const next = await upsertLibrary(library);
    setLibraries(next);
  };

  const handleRemoveLibrary = async (id: string) => {
    const next = await removeStoredLibrary(id);
    setLibraries(next);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Saved Books{books.length > 0 ? ` (${books.length})` : ""}</Text>
      {books.length === 0 ? (
        <Text style={styles.emptyText}>No saved books yet — tap "Save" on a book page to add one.</Text>
      ) : (
        books.map((item) => <BookRow key={`${item.type}:${item.id}`} item={item} onRemove={handleRemove} />)
      )}

      <Text style={styles.sectionTitle}>Saved Authors{authors.length > 0 ? ` (${authors.length})` : ""}</Text>
      {authors.length === 0 ? (
        <Text style={styles.emptyText}>No saved authors yet — tap "Save" on an author page to add one.</Text>
      ) : (
        authors.map((item) => (
          <View key={item.id} style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
              onPress={() => router.push(routes.author(item.id))}
            >
              <Text style={styles.rowText} numberOfLines={2}>
                {item.title}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
              onPress={() => handleRemove(item)}
              hitSlop={8}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}

      <AppearanceSection />

      <Text style={styles.sectionTitle}>Libraries</Text>
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
      >
        <Text style={styles.addLibraryPlus}>+</Text>
        <Text style={styles.addLibraryText}>Add new library</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles({ colors, kicker }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20 },
    sectionTitle: { ...kicker, marginTop: 28, marginBottom: 12 },
    emptyText: { fontSize: 14, color: colors.textFaint, fontStyle: "italic" },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowMain: { flex: 1, paddingRight: 12 },
    rowText: { fontSize: 16, color: colors.text },
    bookBlock: { borderBottomWidth: 1, borderBottomColor: colors.border },
    editButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.chipBackground, marginRight: 8 },
    editText: { fontSize: 13, color: colors.text, fontWeight: "600" },
    removeButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.dangerBackground },
    removeText: { fontSize: 13, color: colors.danger, fontWeight: "600" },
    pressed: { opacity: 0.6 },
    helpText: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 12 },
    themeOptions: { flexDirection: "row", gap: 8 },
    themeOption: { alignSelf: "auto" },
    fieldLabel: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 4 },
    fieldLabelSpaced: { marginTop: 16 },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    saveButton: { marginTop: 14 },
    libraryCard: {
      marginTop: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: 12,
    },
    libraryCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    addLibraryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 20,
      paddingVertical: 10,
    },
    addLibraryPlus: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.link,
      width: 26,
      height: 26,
      lineHeight: 26,
      textAlign: "center",
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.link,
      overflow: "hidden",
    },
    addLibraryText: { fontSize: 16, color: colors.link, fontWeight: "600" },
  });
}
