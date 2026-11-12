import type { HardcoverListSummary } from "@book-explorer/shared";
import { Plus, Square, SquareCheck } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useImperativeHandle, useState, type Ref } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { createHardcoverList, fetchHardcoverLists } from "../api/client";
import { confirmLeave } from "../confirm";
import { hardcoverChoices, keepOffered, linkedTo, listsNotHolding } from "../hardcoverChoices";
import { importChosenLists } from "../hardcoverLists";
import { getSessionToken } from "../hardcoverSession";
import { prefetchMissingSaved } from "../useSavedPrefetch";
import { applyListChanges, leavesLibrary, listChanges } from "../storage/listMembership";
import { getPreferences } from "../storage/preferences";
import {
  createList,
  defaultListFor,
  getLists,
  type ListMember,
  type SavedList,
} from "../storage/savedLists";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";
import { CenteredModal } from "./CenteredModal";
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
  const [onHardcover, setOnHardcover] = useState(false);
  const showHardcover = !!getSessionToken() && (kind ?? chosenKind) === "book";

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      // Hardcover first: if it fails, nothing is created here.
      const hardcoverListId = showHardcover && onHardcover ? (await createHardcoverList({ name: name.trim(), description })).id : undefined;
      const list = await createList({ name, description, kind: kind ?? chosenKind, hardcoverListId });
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
      {showHardcover && (
        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Also create on Hardcover</Text>
          <Switch value={onHardcover} onValueChange={setOnHardcover} trackColor={{ true: theme.colors.cover }} accessibilityLabel="Also create on Hardcover" />
        </View>
      )}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button variant="primary" onPress={submit} disabled={busy} style={styles.submit}>
        {busy ? "Creating..." : submitLabel}
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
  onClose,
  style,
  hidden,
  ref,
}: {
  member: Omit<ListMember, "addedAt">;
  onSave: () => Promise<unknown>;
  onChange?: () => void;
  /** Whenever the sheet closes, by Done or by dismissing. */
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Shows no pill, for a parent that opens the sheet through `ref`. */
  hidden?: boolean;
  ref?: Ref<SaveSheetHandle>;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  const kind: SavedList["kind"] = member.type === "author" ? "author" : "book";
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [remoteLists, setRemoteLists] = useState<HardcoverListSummary[]>([]);
  const [remoteChecked, setRemoteChecked] = useState<Set<number>>(new Set());
  const [onAnyList, setOnAnyList] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  // Why the sheet was opened for the user, e.g. the lock asking to save first. The pill clears it.
  const [notice, setNotice] = useState("");

  const close = () => {
    setOpen(false);
    onClose?.();
  };
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
    // A Hardcover failure just leaves those rows out.
    const remote = getSessionToken() && kind === "book" ? fetchHardcoverLists().catch(() => []) : Promise.resolve([]);
    return Promise.all([getLists(kind), getPreferences(), remote])
      .then(([ls, prefs, rem]) => {
        setLists(ls);
        const choices = hardcoverChoices(rem, ls);
        setRemoteLists(choices);
        setRemoteChecked((prev) => keepOffered(reset ? new Set() : prev, choices));
        if (!reset) return;
        const held = ls.filter(holds);
        // On no list yet: start with the default list ticked, so saving there is just Done.
        const fallback = defaultListFor(ls, kind, prefs.defaultListIds[kind]);
        setChecked(new Set((held.length || !fallback ? held : [fallback]).map((l) => l.id)));
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
  const toggleRemote = (id: number) =>
    setRemoteChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const done = async () => {
    setError("");
    setBusy(true); // also blocks a second tap while the confirm is up
    try {
      if (remoteChecked.size === 0 && leavesLibrary(lists, member, checked) && !(await confirmLeave(member.title))) return;
      let issue = "";
      // Import first: the imported lists then get the book through the normal add path.
      const created = await importChosenLists([...remoteChecked]);
      if (created.length) void prefetchMissingSaved(queryClient);
      setChecked((prev) => new Set([...prev, ...created]));
      // An imported list may already hold the book; adding it again would re-push it to Hardcover.
      const imported = created.length ? listsNotHolding(await getLists(kind), member, created) : [];
      const changes = listChanges(lists, member, checked);
      await applyListChanges(member, { ...changes, add: [...changes.add, ...imported] }, onSave, (m) => {
        issue = issue ? `${issue} ${m}` : m;
        setError(issue);
      });
      onChange?.();
      // Keep the sheet up so the Hardcover message is seen; reload so a second Done doesn't re-apply the same changes.
      if (issue) await load(false);
      else close();
    } catch (e) {
      setError(errorText(e));
      // A failed import may have linked some lists; tick them (they're local rows now) so a retry still adds the book, then reload so it doesn't import them again.
      const fresh = await getLists(kind).catch(() => [] as SavedList[]);
      const now = linkedTo(remoteChecked, fresh);
      setChecked((prev) => new Set([...prev, ...now]));
      await load(false);
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
      <CenteredModal visible={open} label="Choose a list" onClose={close}>
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
                  {remoteLists.map((r) => {
                    const isChecked = remoteChecked.has(r.id);
                    const Icon = isChecked ? SquareCheck : Square;
                    return (
                      <Pressable
                        ref={titleRef(`Import ${r.name} from Hardcover and add this book`)}
                        key={`h${r.id}`}
                        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                        onPress={() => toggleRemote(r.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isChecked }}
                        accessibilityLabel={`${r.name}, a Hardcover list; adds this book and imports the list`}
                      >
                        <Icon size={20} color={isChecked ? theme.colors.cover : theme.colors.inkFaint} />
                        <Text style={styles.rowText} numberOfLines={2}>
                          {r.name} · on Hardcover
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
                <Button variant="primary" onPress={close} style={styles.doneButton}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={done} disabled={busy || loading || !!loadError} style={styles.doneButton}>
                  {busy ? "Saving..." : "Done"}
                </Button>
              </View>
            </ScrollView>
      </CenteredModal>
    </>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
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
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
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
