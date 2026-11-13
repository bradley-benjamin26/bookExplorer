import { useQueryClient } from "@tanstack/react-query";
import type { Work } from "@book-explorer/shared";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { CoverPlaceholder } from "../../src/components/CoverPlaceholder";
import { memberCoverUrl } from "../../src/listCovers";
import { EmptyState } from "../../src/components/EmptyState";
import { ExportButton } from "../../src/components/ExportButton";
import type { ExportFormat } from "../../src/exportFormats";
import { CenteredModal } from "../../src/components/CenteredModal";
import { titleRef } from "../../src/webTitle";
import { today } from "../../src/components/BackupSection";
import { Footer } from "../../src/components/Footer";
import { SkipLink, SkipTarget } from "../../src/components/SkipLink";
import { exportListCsv, exportListJson, ImportError } from "../../src/backup";
import { shareFile } from "../../src/backupFiles";
import { shelfSlug } from "../../src/csv";
import { confirmDestructive, confirmLeave } from "../../src/confirm";
import { copyToHardcover, syncWithHardcover } from "../../src/hardcoverLists";
import { prefetchMissingSaved } from "../../src/useSavedPrefetch";
import { getSessionToken } from "../../src/hardcoverSession";
import { copyToOpenLibrary, syncWithOpenLibrary } from "../../src/openLibraryLists";
import { getOpenLibrarySessionToken } from "../../src/openLibrarySession";
import { memberHref, routes } from "../../src/navigation";
import { listServiceLabels } from "../../src/listServiceLabels";
import { applyListChanges, deleteListAndUnsave, leavesLibrary } from "../../src/storage/listMembership";
import { getList, getLists, linkList, linkOpenLibraryList, type ListMember, type SavedList } from "../../src/storage/savedLists";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

type Service = "Hardcover" | "Open Library";

export default function ListDetail() {
  const { id, skipped, from } = useLocalSearchParams<{ id: string; skipped?: string; from?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const [list, setList] = useState<SavedList | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [busy, setBusy] = useState(false);
  const [badCovers, setBadCovers] = useState<Set<string>>(new Set());
  // State lags a render, so a fast second tap would pass a `busy` check; the ref flips synchronously.
  const busyRef = useRef(false);
  const [progress, setProgress] = useState("");
  const [active, setActive] = useState<Service | null>(null);
  const [copying, setCopying] = useState(false);
  const [summary, setSummary] = useState(() => {
    try {
      const t: string[] = skipped ? JSON.parse(skipped) : [];
      if (!t.length) return "";
      return from === "openlibrary" ? `Not imported from Open Library: ${t.join(", ")}.` : `Not imported (no ISBN on Hardcover): ${t.join(", ")}.`;
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
      await applyListChanges(member, { add: [], remove: [id] }, async () => {}, (m) => setError((prev) => (prev ? `${prev} ${m}` : m)));
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

  // Both services share one busy flag, summary line and progress modal.
  const runSync = async (service: Service, op: (l: SavedList) => Promise<{ missing: string[]; skipped?: string[] }>) => {
    if (!list || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActive(service);
    setError("");
    setSummary("");
    try {
      const { missing, skipped = [] } = await op(list);
      const lines = [
        ...(missing.length ? [`${service} doesn't have: ${missing.join(", ")}.`] : []),
        ...(skipped.length ? [`Not synced from ${service}: ${skipped.join(", ")}.`] : []),
      ];
      setSummary(lines.join("\n") || `${service} is up to date.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setProgress("");
    busyRef.current = false;
    setBusy(false);
    setActive(null);
    load();
  };
  const copy = async (service: Service) => {
    if (busyRef.current) return;
    if (service === "Open Library") {
      // Hold the flag through the confirm, as unlink does, so a second tap can't start a parallel copy.
      busyRef.current = true;
      const ok = await confirmDestructive("Make this list public?", "Open Library lists are public. Anyone can see this list's name, description and books.", "Copy to Open Library");
      busyRef.current = false; // runSync re-takes it synchronously below
      if (!ok) return;
    }
    const run = service === "Hardcover" ? copyToHardcover : copyToOpenLibrary;
    setCopying(true);
    try {
      await runSync(service, (l) =>
        run(
          l,
          (d, t) => setProgress(`Copying ${d} of ${t}…`),
          undefined,
          (s) => setProgress(`${service} asked us to wait ${s} seconds, then we'll continue.`),
        ),
      );
    } finally {
      setCopying(false);
    }
  };
  const sync = (service: Service) =>
    runSync(service, async (l) => {
      const r = await (service === "Hardcover" ? syncWithHardcover : syncWithOpenLibrary)(l);
      void prefetchMissingSaved(queryClient);
      return r;
    });
  const unlink = async (service: Service) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (!(await confirmDestructive(`Unlink from ${service}?`, `This list stops syncing. Nothing changes on ${service}.`, "Unlink"))) return;
      await (service === "Hardcover" ? linkList(id, null) : linkOpenLibraryList(id, null));
    } finally {
      busyRef.current = false;
    }
    load();
  };
  const syncButtons = (service: Service, linked: boolean) => {
    const labels = listServiceLabels(service);
    return linked ? (
      <>
        <Button variant="pill" disabled={busy} onPress={() => sync(service)}>{active === service ? "Syncing…" : labels.sync}</Button>
        <Button variant="pill" disabled={busy} onPress={() => unlink(service)} accessibilityLabel={labels.unlink}>{labels.unlink}</Button>
      </>
    ) : (
      <Button variant="pill" disabled={busy} onPress={() => copy(service)}>{(active === service && progress) || labels.copy}</Button>
    );
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
          <CenteredModal visible={copying} label={`Copying to ${active}`}>
            <View style={styles.copyCard}>
              <ActivityIndicator color={theme.colors.cover} />
              <Text style={styles.copyTitle}>Copying to {active}</Text>
              <Text style={styles.copyProgress} accessibilityLiveRegion="polite">
                {progress || "Starting…"}
              </Text>
            </View>
          </CenteredModal>
          <View style={styles.exportRow}>
            <ExportButton onChoose={exportList} label="Export this list" />
            {list.kind === "book" && getSessionToken() !== null ? syncButtons("Hardcover", !!list.hardcoverListId) : null}
            {getOpenLibrarySessionToken() !== null ? syncButtons("Open Library", !!list.openLibraryListId) : null}
          </View>
          {list.members.length === 0 ? (
            list.kind === "author" ? (
              <EmptyState message="This list is empty. Save an author from their page to add them here." />
            ) : (
              <EmptyState message="This list is empty. Save a book from its page to add it here." actionLabel="Search for a book" onAction={() => router.push("/")} />
            )
          ) : (
            <>
            {list.members.length > 1 && <SkipLink name="list-books" label="Skip list" />}
            {list.members.map((member) => {
              const key = `${member.type}:${member.id}`;
              const coverUrl = badCovers.has(key) ? null : memberCoverUrl(member);
              return (
              <View key={key} style={styles.row}>
                <Pressable
                  ref={titleRef(`Open ${member.title}`)}
                  style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                  onPress={() => router.push(memberHref(member))}
                  accessibilityRole="button"
                  accessibilityLabel={member.title}
                >
                  {coverUrl ? (
                    <Image
                      source={{ uri: `${coverUrl}?default=false` }}
                      style={styles.cover}
                      resizeMode="contain"
                      alt=""
                      onError={() => setBadCovers((prev) => new Set(prev).add(key))}
                    />
                  ) : (
                    <CoverPlaceholder width={44} height={64} />
                  )}
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
              );
            })}
            {list.members.length > 1 && <SkipTarget name="list-books" />}
            </>
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
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingRight: spacing.md },
    cover: { width: 44, height: 64, borderRadius: radii.xs },
    rowText: { flex: 1, fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    removeButton: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      backgroundColor: colors.dangerBackground,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    removeText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.danger },
    exportRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
    retry: { marginTop: spacing.sm, alignSelf: "flex-start" },
    deleteButton: { marginTop: spacing.xxl, backgroundColor: colors.dangerBackground },
    pressed: { opacity: 0.6 },
  });
}
