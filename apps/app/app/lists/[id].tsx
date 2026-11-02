import { useQueryClient } from "@tanstack/react-query";
import type { Work } from "@book-explorer/shared";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ExportButton } from "../../src/components/ExportButton";
import type { ExportFormat } from "../../src/exportFormats";
import { CenteredModal } from "../../src/components/CenteredModal";
import { titleRef } from "../../src/webTitle";
import { today } from "../../src/components/BackupSection";
import { Footer } from "../../src/components/Footer";
import { exportListCsv, exportListJson, ImportError } from "../../src/backup";
import { shareFile } from "../../src/backupFiles";
import { shelfSlug } from "../../src/csv";
import { confirmDestructive, confirmLeave } from "../../src/confirm";
import { copyToHardcover, syncWithHardcover } from "../../src/hardcoverLists";
import { getSessionToken } from "../../src/hardcoverSession";
import { memberHref, routes } from "../../src/navigation";
import { applyListChanges, deleteListAndUnsave, leavesLibrary } from "../../src/storage/listMembership";
import { getList, getLists, linkList, type ListMember, type SavedList } from "../../src/storage/savedLists";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

export default function ListDetail() {
  const { id, skipped } = useLocalSearchParams<{ id: string; skipped?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const [list, setList] = useState<SavedList | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [busy, setBusy] = useState(false);
  // State lags a render, so a fast second tap would pass a `busy` check; the ref flips synchronously.
  const busyRef = useRef(false);
  const [progress, setProgress] = useState("");
  const [copying, setCopying] = useState(false);
  const [summary, setSummary] = useState(() => {
    try {
      const t: string[] = skipped ? JSON.parse(skipped) : [];
      return t.length ? `Not imported (no ISBN on Hardcover): ${t.join(", ")}.` : "";
    } catch {
      return "";
    }
  });

  const load = useCallback(() => {
    setLoadError("");
    getList(id)
      .then(setList)
      .catch(() => setLoadError("Couldn't load this list. Try again."));
  }, [id]);
  useFocusEffect(load);

  const handleRemove = async (member: ListMember) => {
    setError("");
    try {
      const lists = await getLists(member.type === "author" ? "author" : "book");
      const others = new Set(lists.filter((l) => l.id !== id && l.members.some((m) => m.type === member.type && m.id === member.id)).map((l) => l.id));
      if (leavesLibrary(lists, member, others) && !(await confirmLeave(member.title))) return;
      await applyListChanges(member, { add: [], remove: [id] }, async () => {}, setError);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    load();
  };

  // Same failure handling as BackupSection's attempt.
  const exportList = async (ext: ExportFormat) => {
    setError("");
    try {
      const file = `${shelfSlug(list?.name ?? "") || "list"}-${today()}.${ext}`;
      if (ext === "csv") await shareFile(file, await exportListCsv(id, (w) => queryClient.getQueryData<Work>(["work", w])?.isbn ?? null), "text/csv");
      else await shareFile(file, await exportListJson(id), "application/json");
    } catch (e) {
      setError(e instanceof ImportError ? e.message : "Something went wrong. Please try again.");
    }
  };

  const runHardcover = async (op: (l: SavedList) => Promise<{ missing: string[] }>) => {
    if (!list || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setSummary("");
    try {
      const { missing } = await op(list);
      setSummary(missing.length ? `Hardcover doesn't have: ${missing.join(", ")}.` : "Hardcover is up to date.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setProgress("");
    busyRef.current = false;
    setBusy(false);
    load();
  };
  const copy = async () => {
    setCopying(true);
    try {
      await runHardcover((l) =>
        copyToHardcover(
          l,
          (d, t) => setProgress(`Copying ${d} of ${t}…`),
          undefined,
          (s) => setProgress(`Hardcover asked us to wait ${s} seconds, then we'll continue.`),
        ),
      );
    } finally {
      setCopying(false);
    }
  };
  const sync = () => runHardcover(syncWithHardcover);
  const unlink = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (!(await confirmDestructive("Unlink from Hardcover?", "This list stops syncing. Nothing changes on Hardcover.", "Unlink"))) return;
      await linkList(id, null);
    } finally {
      busyRef.current = false;
    }
    load();
  };

  const doDelete = async () => {
    setError("");
    try {
      await deleteListAndUnsave(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    // A deep-linked list has nothing to go back to.
    if (router.canGoBack()) router.back();
    else router.replace(routes.lists());
  };
  const confirmDelete = async () => {
    if (!list) return;
    const message = `Delete “${list.name}”? Books and authors on no other list leave your library, with their notes. This can't be undone.`;
    if (await confirmDestructive("Delete list?", message, "Delete")) doDelete();
  };

  if (list === undefined && !loadError) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!list ? (
        loadError ? (
          <>
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {loadError}
            </Text>
            <Button variant="pill" onPress={load} style={styles.retry}>
              Retry
            </Button>
          </>
        ) : (
          <Text style={styles.emptyText}>This list no longer exists.</Text>
        )
      ) : (
        <>
          <Text style={styles.name} accessibilityRole="header">
            {list.name}
          </Text>
          {list.description ? <Text style={styles.description}>{list.description}</Text> : null}
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          {summary ? <Text style={styles.description}>{summary}</Text> : null}
          <CenteredModal visible={copying} label="Copying to Hardcover">
            <View style={styles.copyCard}>
              <ActivityIndicator color={theme.colors.cover} />
              <Text style={styles.copyTitle}>Copying to Hardcover</Text>
              <Text style={styles.copyProgress} accessibilityLiveRegion="polite">
                {progress || "Starting…"}
              </Text>
            </View>
          </CenteredModal>
          <View style={styles.exportRow}>
            <ExportButton onChoose={exportList} label="Export this list" />
            {list.kind === "book" && getSessionToken() !== null ? (
              list.hardcoverListId ? (
                <>
                  <Button variant="pill" disabled={busy} onPress={sync}>{busy ? "Syncing…" : "Sync with Hardcover"}</Button>
                  <Button variant="pill" disabled={busy} onPress={unlink}>Unlink</Button>
                </>
              ) : (
                <Button variant="pill" disabled={busy} onPress={copy}>{progress || "Copy to Hardcover"}</Button>
              )
            ) : null}
          </View>
          {list.members.length === 0 ? (
            list.kind === "author" ? (
              <EmptyState message="This list is empty. Save an author from their page to add them here." />
            ) : (
              <EmptyState message="This list is empty. Save a book from its page to add it here." actionLabel="Search for a book" onAction={() => router.push("/")} />
            )
          ) : (
            list.members.map((member) => (
              <View key={`${member.type}:${member.id}`} style={styles.row}>
                <Pressable
                  ref={titleRef(`Open ${member.title}`)}
                  style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                  onPress={() => router.push(memberHref(member))}
                  accessibilityRole="button"
                  accessibilityLabel={member.title}
                >
                  <Text style={styles.rowText} numberOfLines={2}>
                    {member.title}
                  </Text>
                </Pressable>
                <Pressable
                  ref={titleRef("Remove from this list")}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                  onPress={() => handleRemove(member)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${member.title}`}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
          <Button variant="pill" onPress={confirmDelete} style={styles.deleteButton} textStyle={styles.removeText}>
            Delete list
          </Button>
        </>
      )}
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    copyCard: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
    copyTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink },
    copyProgress: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, textAlign: "center" },
    name: { fontFamily: fonts.displayMedium, fontSize: typeScale.lg, color: colors.ink },
    description: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, marginTop: spacing.sm, lineHeight: 22 },
    emptyText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, fontStyle: "italic", marginTop: spacing.lg },
    error: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.md },
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
    removeButton: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      backgroundColor: colors.dangerBackground,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    removeText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.danger },
    exportRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
    retry: { marginTop: spacing.sm, alignSelf: "flex-start" },
    deleteButton: { marginTop: spacing.xxl, backgroundColor: colors.dangerBackground },
    pressed: { opacity: 0.6 },
  });
}
