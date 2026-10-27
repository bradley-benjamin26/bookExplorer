import { MAX_TAG_LENGTH, slugifySubject, type TaggedTerm } from "@book-explorer/shared";
import { useRouter } from "expo-router";
import { Lock, LockOpen } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { suggestTerms } from "../api/client";
import { routes } from "../navigation";
import { addTerm, removeTerm, SUBJECTS_SHOWN, visibleSubjects, type Terms } from "../termsDraft";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { titleCase } from "../titleCase";
import { titleRef } from "../webTitle";
import { Button } from "./Button";

const SUGGEST_DELAY_MS = 300;
const SUGGEST_MIN_LENGTH = 3;
const MAX_SUGGESTIONS = 8;

type Kind = keyof Terms;

/** The page's one lock (see useEditLock), shown in the DetailTop actions. */
export function LockButton({ unlocked, onPress }: { unlocked: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const label = unlocked ? "Lock and save your edits" : "Edit genres, subjects and notes";
  const LockIcon = unlocked ? LockOpen : Lock;
  return (
    <Pressable
      ref={titleRef(label)}
      style={({ pressed }) => [styles.lockButton, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LockIcon size={18} color={theme.colors.cover} />
    </Pressable>
  );
}

/**
 * "Genres" or "Subjects": chips that link to subject pages while locked; while unlocked, × removes
 * and the add field takes LC suggestions or freeform text. Collapsed, Subjects shows the first
 * SUBJECTS_SHOWN (LCSH-backed first) with a toggle for the rest.
 */
export function TermsSection({
  kind,
  labels,
  unlocked,
  onEdit,
  tagged,
}: {
  kind: Kind;
  labels: string[];
  unlocked: boolean;
  onEdit: (change: (list: string[]) => string[]) => void;
  tagged?: TaggedTerm[];
}) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  if (!unlocked && labels.length === 0) return null;

  const collapsible = kind === "subjects" && !unlocked && labels.length > SUBJECTS_SHOWN;
  const shown = collapsible && !expanded ? visibleSubjects(labels, tagged ?? []) : labels;
  const chipStyle = kind === "genres" ? styles.genreTag : styles.subjectTag;
  const textStyle = kind === "genres" ? styles.genreTagText : styles.subjectTagText;
  const toggleLabel = expanded ? "Show fewer subjects" : `Show all ${labels.length} subjects`;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{kind === "genres" ? "Genres" : "Subjects"}</Text>
      <View style={styles.row}>
        {shown.length > 0 && (
          <View style={styles.tags}>
            {shown.map((label) =>
              unlocked ? (
                <Pressable
                  ref={titleRef(`Remove ${titleCase(label)}`)}
                  key={label}
                  style={({ pressed }) => [chipStyle, pressed && styles.pressed]}
                  onPress={() => onEdit((list) => removeTerm(list, label))}
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
        {collapsible && (
          <Button variant="pill" onPress={() => setExpanded((e) => !e)} accessibilityState={{ expanded }} tooltip={toggleLabel}>
            {toggleLabel}
          </Button>
        )}
        {unlocked && <AddTermField kind={kind} onAdd={(value) => onEdit((list) => addTerm(list, value))} />}
      </View>
    </View>
  );
}

/** Read-only "Awards" chips, or nothing when there are none. */
export function AwardsSection({ awards }: { awards: string[] }) {
  const styles = useThemedStyles(createStyles);
  if (awards.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">Awards</Text>
      <View style={styles.tags}>
        {awards.map((award) => (
          <View key={award} style={styles.genreTag}>
            <Text style={styles.genreTagText}>{titleCase(award)}</Text>
          </View>
        ))}
      </View>
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
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    lockButton: { padding: spacing.xs },
    row: { gap: spacing.sm },
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
