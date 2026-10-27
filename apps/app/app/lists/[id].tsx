import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { today } from "../../src/components/BackupSection";
import { Footer } from "../../src/components/Footer";
import { exportListCsv, exportListJson, ImportError } from "../../src/backup";
import { shareFile } from "../../src/backupFiles";
import { shelfSlug } from "../../src/csv";
import { memberHref, routes } from "../../src/navigation";
import { applyListChanges, deleteListAndUnsave } from "../../src/storage/listMembership";
import { getList, type ListMember, type SavedList } from "../../src/storage/savedLists";
import { useThemedStyles, type Theme } from "../../src/theme";

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [list, setList] = useState<SavedList | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

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
      await applyListChanges(member, { add: [], remove: [id] }, async () => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    load();
  };

  // Same failure handling as BackupSection's attempt.
  const exportList = async (ext: "csv" | "json") => {
    setError("");
    try {
      const file = `${shelfSlug(list?.name ?? "") || "list"}-${today()}.${ext}`;
      if (ext === "csv") await shareFile(file, await exportListCsv(id), "text/csv");
      else await shareFile(file, await exportListJson(id), "application/json");
    } catch (e) {
      setError(e instanceof ImportError ? e.message : "Something went wrong. Please try again.");
    }
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
  const confirmDelete = () => {
    if (!list) return;
    const message = `Delete “${list.name}”? This can't be undone.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) doDelete();
    } else {
      Alert.alert("Delete list?", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
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
          {list.members.length === 0 ? (
            <Text style={styles.emptyText}>
              Nothing here yet. Tap “Save to list” on {list.kind === "author" ? "an author" : "a book"} page to add one.
            </Text>
          ) : (
            list.members.map((member) => (
              <View key={`${member.type}:${member.id}`} style={styles.row}>
                <Pressable
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
          <View style={styles.exportRow}>
            <Button variant="pill" onPress={() => exportList("csv")}>
              Export CSV
            </Button>
            <Button variant="pill" onPress={() => exportList("json")}>
              Export JSON
            </Button>
          </View>
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
    content: { padding: spacing.lg },
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
