import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";
import { titleCase } from "../titleCase";

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
      <Text style={styles.sectionTitle} accessibilityRole="header">{label}</Text>
      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              style={styles.tag}
              onPress={() => onChange(tags.filter((t) => t !== tag))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tag}`}
            >
              <Text style={styles.tagText}>{titleCase(tag)} ×</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder={`Add a ${label.toLowerCase().replace(/s$/, "")}`}
          placeholderTextColor={theme.colors.inkFaint}
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

// Notes are written once typing pauses this long, so a write doesn't happen
// on every keystroke. Saving only on blur (as this used to) lost notes when
// someone navigated away mid-edit, since that doesn't reliably blur the
// input first — any still-pending save is also flushed on unmount.
const NOTES_SAVE_DELAY_MS = 600;

type EditableFields = { subjects: string[]; genres: string[]; notes: string };

/** Shown for a saved book or work once it's saved, in place of the read-only
 * subject/genre tags — lets the user add to or remove from this saved
 * record's own subjects/genres and keep freeform notes. Tag changes are
 * persisted immediately (through `update`, the record kind's own storage
 * function) and notes shortly after typing pauses, rather than needing an
 * explicit save step, matching how the rest of the app behaves. */
export function SavedRecordEditor<R extends EditableFields>({
  record,
  update,
  onChange,
}: {
  record: R;
  update: (changes: Partial<EditableFields>) => Promise<R | null>;
  onChange: (next: R) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  // Tags are tracked locally (updated synchronously on each tap) rather than
  // read back from `record`, which only updates once the async write
  // finishes — otherwise two quick taps would both build on the same old
  // list, and the second would undo the first.
  const [subjects, setSubjects] = useState(record.subjects);
  const [genres, setGenres] = useState(record.genres);
  const [notes, setNotes] = useState(record.notes);

  // The latest unsaved notes, if any — a ref so the unmount flush below sees
  // the current value rather than the one from its first render.
  const pendingNotes = useRef<string | null>(null);

  // Writes this editor has started that haven't finished yet. While any are
  // pending, the local state above is ahead of `record` and wins; once
  // they've all landed, `record` is caught up and is synced back in below.
  const inFlightWrites = useRef(0);

  const persist = async (changes: Partial<EditableFields>) => {
    inFlightWrites.current += 1;
    try {
      const next = await update(changes);
      if (next) onChange(next);
    } finally {
      inFlightWrites.current -= 1;
    }
  };

  // This editor can mount while a write started by an earlier instance of it
  // (e.g. the Saved screen's row collapsed with Done, then reopened) is still
  // landing, so its initial state can predate that write. Picking up `record`
  // whenever it changes and nothing of this instance's own is pending keeps
  // it from showing — and then building the next edit on — stale tags.
  useEffect(() => {
    if (inFlightWrites.current > 0) return;
    setSubjects(record.subjects);
    setGenres(record.genres);
    if (pendingNotes.current === null) setNotes(record.notes);
  }, [record]);

  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const flushNotes = () => {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = null;
    if (pendingNotes.current === null) return;
    const value = pendingNotes.current;
    pendingNotes.current = null;
    persistRef.current({ notes: value });
  };

  useEffect(() => flushNotes, []);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    pendingNotes.current = value;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(flushNotes, NOTES_SAVE_DELAY_MS);
  };

  return (
    <View style={styles.container}>
      <TagEditor
        label="Subjects"
        tags={subjects}
        onChange={(next) => {
          setSubjects(next);
          persist({ subjects: next });
        }}
      />
      <TagEditor
        label="Genres"
        tags={genres}
        onChange={(next) => {
          setGenres(next);
          persist({ genres: next });
        }}
      />
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Your notes about this book..."
          placeholderTextColor={theme.colors.inkFaint}
          value={notes}
          onChangeText={handleNotesChange}
          onBlur={flushNotes}
          multiline
        />
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { width: "100%", marginTop: spacing.xl },
    section: { marginBottom: spacing.lg },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: 10 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: 10 },
    tag: { backgroundColor: colors.chipBackground, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 7 },
    tagText: { fontSize: typeScale.xs, fontFamily: fonts.bodySemiBold, color: colors.ink },
    addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.ink,
    },
    addButton: { alignSelf: "auto" },
    notesInput: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: 14,
      paddingVertical: spacing.md,
      fontSize: typeScale.sm,
      fontFamily: fonts.body,
      color: colors.ink,
      minHeight: 100,
      textAlignVertical: "top",
    },
  });
}
