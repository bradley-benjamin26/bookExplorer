import { Plus, Square, SquareCheck } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  addToList,
  createList,
  getLists,
  removeFromList,
  type ListMember,
  type SavedList,
} from "../storage/savedLists";
import { CONTENT_MAX_WIDTH, useTheme, useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";

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
      await onCreated(list);
      setName("");
      setDescription("");
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

/** A pill that opens a sheet for putting `member` on lists of its kind, or on a new one. */
export function AddToListButton({ member }: { member: Omit<ListMember, "addedAt"> }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const kind: SavedList["kind"] = member.type === "author" ? "author" : "book";
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = () => getLists(kind).then(setLists);
  const show = () => {
    setCreating(false);
    setError("");
    setOpen(true);
    load();
  };
  const isIn = (list: SavedList) => list.members.some((m) => m.type === member.type && m.id === member.id);
  const toggle = async (list: SavedList) => {
    setError("");
    try {
      await (isIn(list) ? removeFromList(list.id, member.type, member.id) : addToList(list.id, member));
    } catch (e) {
      setError(errorText(e));
    }
    await load();
  };
  const handleCreated = async (list: SavedList) => {
    await addToList(list.id, member);
    setCreating(false);
    await load();
  };

  return (
    <>
      <Button variant="pill" onPress={show} style={styles.trigger}>
        Add to list
      </Button>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.heading} accessibilityRole="header">
                Choose a list
              </Text>
              {lists.map((list) => {
                const checked = isIn(list);
                const Icon = checked ? SquareCheck : Square;
                return (
                  <Pressable
                    key={list.id}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    onPress={() => toggle(list)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={list.name}
                  >
                    <Icon size={20} color={checked ? theme.colors.cover : theme.colors.inkFaint} />
                    <Text style={styles.rowText} numberOfLines={2}>
                      {list.name}
                    </Text>
                  </Pressable>
                );
              })}
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
              <Pressable
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
              <Button variant="primary" onPress={() => setOpen(false)} style={styles.done}>
                Done
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    trigger: { marginTop: 8 },
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
    done: { marginTop: spacing.lg },
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
