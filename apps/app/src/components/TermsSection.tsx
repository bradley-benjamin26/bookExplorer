import { MAX_TAG_LENGTH, slugifySubject } from "@book-explorer/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { Lock, LockOpen } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { suggestTerms } from "../api/client";
import { routes } from "../navigation";
import { addTerm, draftChanged, removeTerm, type Terms } from "../termsDraft";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { titleCase } from "../titleCase";
import { titleRef } from "../webTitle";

const SUGGEST_DELAY_MS = 300;
const SUGGEST_MIN_LENGTH = 3;
const MAX_SUGGESTIONS = 8;

type Kind = "subjects" | "genres";

/**
 * "Subjects & Genres": chips that link to subject pages while locked. Unlocking edits a local draft
 * (× removes, the add fields take LC suggestions or freeform text) that is saved when locked again,
 * or when the screen loses focus or unmounts, so leaving without relocking doesn't lose edits.
 * An unsaved record (`record` null) asks to be saved first and unlocks once it is.
 */
export function TermsSection({
  subjects,
  genres,
  awards,
  record,
  onUpdate,
  onRequestSave,
  startUnlocked,
}: {
  subjects: string[];
  genres: string[];
  awards: string[];
  record: Terms | null;
  onUpdate: (c: Terms) => Promise<unknown>;
  onRequestSave: () => void;
  startUnlocked?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  // Waiting for a record to exist (after a save request, or `startUnlocked` before the record loads).
  const [pendingUnlock, setPendingUnlock] = useState(!!startUnlocked);
  const [draft, setDraft] = useState<Terms>({ subjects: [], genres: [] });
  const [error, setError] = useState<string | null>(null);

  // Latest values for the blur/unmount save below, which would otherwise see its first render's.
  const latest = useRef({ unlocked, draft, record, onUpdate });
  latest.current = { unlocked, draft, record, onUpdate };

  const unlock = (r: Terms) => {
    setDraft({ subjects: r.subjects, genres: r.genres });
    setError(null);
    setUnlocked(true);
  };

  useEffect(() => {
    if (pendingUnlock && record) {
      setPendingUnlock(false);
      unlock(record);
    }
  }, [pendingUnlock, record]);

  const saveDraft = async () => {
    const { draft, record, onUpdate } = latest.current;
    if (record && draftChanged(draft, record)) await onUpdate(draft);
  };

  // A focus cleanup runs on blur (a link pushed over this screen) and on unmount (Back).
  useFocusEffect(
    useCallback(
      () => () => {
        if (latest.current.unlocked) saveDraft().catch(() => setError("Couldn't save your changes"));
      },
      []
    )
  );

  const toggleLock = async () => {
    if (!unlocked) {
      if (record) unlock(record);
      else {
        setPendingUnlock(true);
        onRequestSave();
      }
      return;
    }
    try {
      await saveDraft();
      setUnlocked(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your changes");
    }
  };

  const shown: Terms = unlocked ? draft : { subjects, genres };
  const edit = (kind: Kind, change: (list: string[]) => string[]) =>
    setDraft((d) => ({ ...d, [kind]: change(d[kind]) }));
  const lockLabel = unlocked ? "Lock and save subjects and genres" : "Edit subjects and genres";
  const LockIcon = unlocked ? LockOpen : Lock;

  const row = (kind: Kind) => {
    const chipStyle = kind === "genres" ? styles.genreTag : styles.subjectTag;
    const textStyle = kind === "genres" ? styles.genreTagText : styles.subjectTagText;
    return (
      <View key={kind} style={styles.row}>
        {shown[kind].length > 0 && (
          <View style={styles.tags}>
            {shown[kind].map((label) =>
              unlocked ? (
                <Pressable
                  ref={titleRef(`Remove ${titleCase(label)}`)}
                  key={label}
                  style={({ pressed }) => [chipStyle, pressed && styles.pressed]}
                  onPress={() => edit(kind, (list) => removeTerm(list, label))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${titleCase(label)}`}
                >
                  <Text style={textStyle}>{titleCase(label)} ×</Text>
                </Pressable>
              ) : (
                <Pressable
                  ref={titleRef(`View ${titleCase(label)}`)}
                  key={label}
                  style={({ pressed }) => [chipStyle, pressed && styles.pressed]}
                  onPress={() => router.push(routes.subject(slugifySubject(label)))}
                  accessibilityRole="button"
                  accessibilityLabel={titleCase(label)}
                >
                  <Text style={textStyle}>{titleCase(label)}</Text>
                </Pressable>
              )
            )}
          </View>
        )}
        {unlocked && <AddTermField kind={kind} onAdd={(value) => edit(kind, (list) => addTerm(list, value))} />}
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Subjects & Genres</Text>
        <Pressable
          ref={titleRef(lockLabel)}
          style={({ pressed }) => [styles.lockButton, pressed && styles.pressed]}
          onPress={toggleLock}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={lockLabel}
        >
          <LockIcon size={18} color={theme.colors.cover} />
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {row("genres")}
      {row("subjects")}
      {awards.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Awards</Text>
          <View style={styles.tags}>
            {awards.map((award) => (
              <View key={award} style={styles.genreTag}>
                <Text style={styles.genreTagText}>{titleCase(award)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** An add field with debounced LC suggestions; Enter adds the typed text as-is. */
function AddTermField({ kind, onAdd }: { kind: Kind; onAdd: (value: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const q = text.trim();
    setSuggestions([]);
    if (q.length < SUGGEST_MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // A failed request (offline, LOC down) just shows no suggestions.
      suggestTerms(kind, q, controller.signal)
        .then((terms) => setSuggestions(terms.slice(0, MAX_SUGGESTIONS)))
        .catch(() => {});
    }, SUGGEST_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, text]);

  const add = (value: string) => {
    onAdd(value);
    setText("");
  };

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder={kind === "genres" ? "Add a genre" : "Add a subject"}
        placeholderTextColor={theme.colors.inkFaint}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => add(text)}
        returnKeyType="done"
        maxLength={MAX_TAG_LENGTH}
      />
      {suggestions.map((term) => (
        <Pressable
          ref={titleRef(`Add ${term}`)}
          key={term}
          style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
          onPress={() => add(term)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${term}`}
        >
          <Text style={styles.suggestionText}>{term}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    section: { marginTop: spacing.xxl, width: "100%" },
    heading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink },
    lockButton: { padding: spacing.xs },
    error: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginBottom: spacing.sm },
    row: { marginBottom: spacing.md, gap: spacing.sm },
    rowLabel: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.inkFaint },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    genreTag: {
      backgroundColor: colors.chipBackgroundGenre,
      borderRadius: radii.pill,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.chipTextGenre,
    },
    genreTagText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.chipTextGenre },
    // Matches how the graph explorer colors subject nodes.
    subjectTag: {
      backgroundColor: colors.chipBackgroundSubject,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.chipTextSubject,
    },
    subjectTagText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.chipTextSubject },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.ink,
    },
    suggestion: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
    suggestionText: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.cover },
    pressed: { opacity: 0.6 },
  });
}
