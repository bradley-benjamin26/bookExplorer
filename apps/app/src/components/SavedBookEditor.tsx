import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { updateSavedBook, type SavedBookRecord } from "../storage/savedBooks";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";

function TagEditor({ label, tags, onChange }: { label: string; tags: string[]; onChange: (next: string[]) => void }) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    const value = draft.trim();
    if (!value || tags.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...tags, value]);
    setDraft("");
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable key={tag} style={styles.tag} onPress={() => onChange(tags.filter((t) => t !== tag))}>
              <Text style={styles.tagText}>{tag} ×</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder={`Add a ${label.toLowerCase().replace(/s$/, "")}`}
          placeholderTextColor={theme.colors.textFaint}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Button variant="pill" onPress={handleAdd} style={styles.addButton}>
          Add
        </Button>
      </View>
    </View>
  );
}

/** Shown on a book's detail page once it's saved, in place of the read-only
 * subject/genre tags — lets the user add to or remove from this saved
 * record's own subjects/genres and keep freeform notes. Each change is
 * persisted immediately (tags) or on blur (notes) rather than needing an
 * explicit save step, matching how the rest of this screen behaves. */
export function SavedBookEditor({
  record,
  onChange,
}: {
  record: SavedBookRecord;
  onChange: (next: SavedBookRecord) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const [notes, setNotes] = useState(record.notes);

  const persist = async (changes: Partial<Pick<SavedBookRecord, "subjects" | "genres" | "notes">>) => {
    const next = await updateSavedBook(record.isbn, changes);
    if (next) onChange(next);
  };

  return (
    <View style={styles.container}>
      <TagEditor label="Subjects" tags={record.subjects} onChange={(subjects) => persist({ subjects })} />
      <TagEditor label="Genres" tags={record.genres} onChange={(genres) => persist({ genres })} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Your notes about this book..."
          placeholderTextColor={theme.colors.textFaint}
          value={notes}
          onChangeText={setNotes}
          onBlur={() => persist({ notes })}
          multiline
        />
      </View>
    </View>
  );
}

function createStyles({ colors, kicker }: Theme) {
  return StyleSheet.create({
    container: { width: "100%", marginTop: 24 },
    section: { marginBottom: 20 },
    sectionTitle: { ...kicker, marginBottom: 10 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    tag: { backgroundColor: colors.chipBackground, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
    tagText: { fontSize: 13, fontWeight: "600", color: colors.text },
    addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 14,
      color: colors.text,
    },
    addButton: { alignSelf: "auto" },
    notesInput: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      minHeight: 100,
      textAlignVertical: "top",
    },
  });
}
