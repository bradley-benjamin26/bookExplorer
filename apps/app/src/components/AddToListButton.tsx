import { Plus, Square, SquareCheck } from "lucide-react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useImperativeHandle, useState, type Ref } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { confirmLeave } from "../confirm";
import { applyListChanges, leavesLibrary, listChanges } from "../storage/listMembership";
import {
  createList,
  getLists,
  type ListMember,
  type SavedList,
} from "../storage/savedLists";
import { CONTENT_MAX_WIDTH, useTheme, useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";
import { titleRef } from "../webTitle";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Name and description inputs that create a list. With no `kind`, the form asks which kind. */
export function CreateListForm({
  kind,
  submitLabel,
  onCreated,
}: {
  kind?: SavedList["kind"];
  submitLabel: string;
  onCreated: (list: SavedList) => Promise<void> | void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [chosenKind, setChosenKind] = useState<SavedList["kind"]>("book");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const list = await createList({ name, description, kind: kind ?? chosenKind });
      // Clear first: a failing onCreated must not leave the form able to create a duplicate on retry.
      setName("");
      setDescription("");
      await onCreated(list);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      {!kind && (
        <View style={styles.kindRow}>
          {(["book", "author"] as const).map((k) => (
            <Button key={k} variant="pill" active={chosenKind === k} onPress={() => setChosenKind(k)}>
              {k === "book" ? "Book list" : "Author list"}
            </Button>
          ))}
        </View>
      )}
      <Text style={styles.fieldLabel}>Name (required)</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Book club"
        placeholderTextColor={theme.colors.inkFaint}
        accessibilityLabel="List name"
      />
      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Description (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        multiline
        accessibilityLabel="List description"
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button variant="primary" onPress={submit} disabled={busy} style={styles.submit}>
        {submitLabel}
      </Button>
    </View>
  );
}

/** Lets a parent open the list sheet itself. */
export type SaveSheetHandle = { open: (notice?: string) => void };

const LOAD_ERROR = "Couldn't load your lists. Try again.";

/**
 * A "Save to list" pill that opens a sheet for choosing the lists of its kind (or a new one) that hold `member`.
 * Tapping rows only edits a draft; Done applies it, saving the item first if it joined a list (`onSave`)
 * and unsaving it if it left its last one.
 */
export function AddToListButton({
  member,
  onSave,
  onChange,
  style,
  hidden,
  ref,
}: {
  member: Omit<ListMember, "addedAt">;
  onSave: () => Promise<unknown>;
  onChange?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Shows no pill, for a parent that opens the sheet through `ref`. */
  hidden?: boolean;
  ref?: Ref<SaveSheetHandle>;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const kind: SavedList["kind"] = member.type === "author" ? "author" : "book";
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [onAnyList, setOnAnyList] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  // Why the sheet was opened for the user, e.g. the lock asking to save first. The pill clears it.
  const [notice, setNotice] = useState("");

  const holds = (list: SavedList) => list.members.some((m) => m.type === member.type && m.id === member.id);

  // The star reflects real membership, so re-read it whenever the screen regains focus.
  const refreshStar = useCallback(() => {
    getLists(kind)
      .then((ls) => setOnAnyList(ls.some(holds)))
      .catch(() => {});
  }, [kind, member.type, member.id]);
  useFocusEffect(refreshStar);

  /** Reads the lists; `reset` also restarts the draft from what each list holds. */
  const load = (reset: boolean) => {
    setLoadError("");
    setLoading(true);
    return getLists(kind)
      .then((ls) => {
        setLists(ls);
        if (reset) setChecked(new Set(ls.filter(holds).map((l) => l.id)));
      })
      .catch(() => setLoadError(LOAD_ERROR))
      .finally(() => setLoading(false));
  };
  const show = (why = "") => {
    setNotice(why);
    setCreating(false);
    setError("");
    setOpen(true);
    load(true);
  };
  const toggle = (list: SavedList) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(list.id)) next.add(list.id);
      return next;
    });
  const done = async () => {
    setError("");
    setBusy(true); // also blocks a second tap while the confirm is up
    try {
      if (leavesLibrary(lists, member, checked) && !(await confirmLeave(member.title))) return;
      await applyListChanges(member, listChanges(lists, member, checked), onSave);
      onChange?.();
      setOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      refreshStar();
    }
  };
  useImperativeHandle(ref, () => ({ open: (why) => show(why) }));
  const handleCreated = async (list: SavedList) => {
    setChecked((prev) => new Set(prev).add(list.id));
    setCreating(false);
    await load(false);
  };

  return (
    <>
      {!hidden && <Button variant="pill" starIcon active={onAnyList} onPress={() => show()} style={style} accessibilityLabel={onAnyList ? "Save to list, saved" : "Save to list"} tooltip="Save to one of your lists">
        Save to list
      </Button>}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.heading} accessibilityRole="header">
                Choose a list
              </Text>
              {!!notice && (
                <Text style={styles.notice} accessibilityLiveRegion="polite">
                  {notice}
                </Text>
              )}
              {loadError ? (
                <>
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {loadError}
                  </Text>
                  <Button variant="pill" onPress={() => load(true)} style={styles.retry}>
                    Retry
                  </Button>
                </>
              ) : (
                <>
                  {lists.map((list) => {
                    const isChecked = checked.has(list.id);
                    const Icon = isChecked ? SquareCheck : Square;
                    return (
                      <Pressable
                        ref={titleRef(`Add to or remove from ${list.name}`)}
                        key={list.id}
                        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                        onPress={() => toggle(list)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isChecked }}
                        accessibilityLabel={list.name}
                      >
                        <Icon size={20} color={isChecked ? theme.colors.cover : theme.colors.inkFaint} />
                        <Text style={styles.rowText} numberOfLines={2}>
                          {list.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    ref={titleRef("Create a new list")}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    onPress={() => setCreating((c) => !c)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: creating }}
                    accessibilityLabel="Create new list"
                  >
                    <Plus size={20} color={theme.colors.cover} />
                    <Text style={[styles.rowText, styles.createText]}>Create new list</Text>
                  </Pressable>
                  {creating && <CreateListForm kind={kind} submitLabel="Create and add" onCreated={handleCreated} />}
                </>
              )}
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
              <View style={styles.footer}>
                <Button variant="pill" onPress={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={done} disabled={busy || loading || !!loadError} style={styles.doneButton}>
                  Done
                </Button>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    // No theme token for a scrim; a translucent black reads in both schemes.
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      width: "100%",
      maxWidth: CONTENT_MAX_WIDTH,
      maxHeight: "85%",
      backgroundColor: colors.paper,
      borderTopLeftRadius: radii.md,
      borderTopRightRadius: radii.md,
    },
    sheetContent: { padding: spacing.lg },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    notice: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, marginBottom: spacing.md },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowText: { flex: 1, fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    createText: { fontFamily: fonts.bodySemiBold, color: colors.cover },
    pressed: { opacity: 0.6 },
    footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
    doneButton: { flex: 1 },
    retry: { marginTop: spacing.md, alignSelf: "flex-start" },
    form: { paddingVertical: spacing.md },
    kindRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    fieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink, marginBottom: spacing.xs },
    fieldLabelSpaced: { marginTop: spacing.md },
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
    multiline: { minHeight: 72, textAlignVertical: "top" },
    error: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.sm },
    submit: { marginTop: spacing.md },
  });
}
