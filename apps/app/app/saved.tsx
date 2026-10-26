import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Footer } from "../src/components/Footer";
import { SavedRecordEditor } from "../src/components/SavedRecordEditor";
import { routes } from "../src/navigation";
import { getSavedBook, unsaveBook, updateSavedBook, type SavedBookRecord } from "../src/storage/savedBooks";
import { getSavedWork, unsaveWork, updateSavedWork, type SavedWorkChanges, type SavedWorkRecord } from "../src/storage/savedWorks";
import { getSavedItems, removeSaved, type SavedItem } from "../src/storage/savedItems";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

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

  const load = useCallback(() => {
    getSavedItems().then(setItems);
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {([["Recommendations", routes.recommendations()], ["Settings & backup", routes.settings()]] as const).map(([label, href]) => (
        <Pressable
          key={label}
          style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
          onPress={() => router.push(href)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text style={styles.navRowText}>{label}</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronRight size={18} color={theme.colors.inkFaint} />
          </View>
        </Pressable>
      ))}

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
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    navRowText: { flex: 1, fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
  });
}
