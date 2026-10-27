import { MAX_TEXT_LENGTH } from "@book-explorer/shared";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";

// Notes are written once typing pauses this long, so a write doesn't happen
// on every keystroke. Saving only on blur (as this used to) lost notes when
// someone navigated away mid-edit, since that doesn't reliably blur the
// input first — any still-pending save is also flushed on unmount.
const NOTES_SAVE_DELAY_MS = 600;

type EditableFields = { notes: string };

/** Shown for a saved book or work once it's saved: freeform notes, persisted
 * (through `update`, the record kind's own storage function) shortly after
 * typing pauses, rather than needing an explicit save step, matching how the
 * rest of the app behaves. Subjects and genres are edited in TermsSection. */
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
  // it from showing — and then building the next edit on — stale notes.
  useEffect(() => {
    if (inFlightWrites.current > 0) return;
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Your notes about this book..."
          placeholderTextColor={theme.colors.inkFaint}
          value={notes}
          onChangeText={handleNotesChange}
          onBlur={flushNotes}
          maxLength={MAX_TEXT_LENGTH}
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
