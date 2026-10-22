import { CameraView, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, FlatList, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import type { Book } from "@book-explorer/shared";
import { fetchBookWithAlternate } from "../api/bookLookup";
import { acceptScan, parseTypedIsbn, saveAll } from "../batchScan";
import { ensureSaved } from "../storage/savedItems";
import { saveBookFromApi, updateSavedBook } from "../storage/savedBooks";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";

interface Row {
  isbn: string;
  book?: Book;
  lookup: "loading" | "ok" | "error";
  save: "idle" | "saved" | "failed";
}

async function saveScanned(book: Book, tag: string) {
  await ensureSaved({ type: "book", id: book.isbn, title: book.title });
  const record = await saveBookFromApi(book);
  const label = tag.trim();
  // Libraries in this app are catalogue-search templates, not collections, so the "set" is a tag added to each book's subjects.
  if (label && !record.subjects.includes(label)) await updateSavedBook(book.isbn, { subjects: [...record.subjects, label] });
}

export function BatchScan({ onExit }: { onExit: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [toast, setToast] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tag, setTag] = useState("");
  const [typed, setTyped] = useState("");
  const lastSeen = useRef(new Map<string, number>());
  const known = useRef(new Set<string>());
  const savingLock = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const patch = (isbn: string, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.isbn === isbn ? { ...r, ...change } : r)));

  const say = (message: string) => {
    setToast(message);
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  const resolve = (isbn: string) => {
    patch(isbn, { lookup: "loading" });
    fetchBookWithAlternate(isbn).then(
      (book) => patch(isbn, { book, lookup: "ok" }),
      () => patch(isbn, { lookup: "error" })
    );
  };

  const add = (isbn: string) => {
    if (known.current.has(isbn)) return say("Already in this batch");
    known.current.add(isbn);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    say(`Added ${isbn}`);
    setRows((rs) => [...rs, { isbn, lookup: "loading", save: "idle" }]);
    resolve(isbn);
  };

  const handleScanned = (result: BarcodeScanningResult) => {
    const isbn = acceptScan(lastSeen.current, result.data, Date.now());
    if (isbn) add(isbn);
  };

  const handleTyped = () => {
    const isbn = parseTypedIsbn(typed);
    if (!isbn) return say("Not a valid ISBN-13");
    setTyped("");
    add(isbn);
  };

  const saveRows = async (targets: Row[]) => {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    const outcome = await saveAll(
      targets.filter((r): r is Row & { book: Book } => !!r.book),
      (r) => saveScanned(r.book, tag)
    );
    setRows((rs) => rs.map((r) => (outcome[r.isbn] ? { ...r, save: outcome[r.isbn] } : r)));
    setSaving(false);
    savingLock.current = false;
  };

  // Unsaved scans are lost on exit, so ask first.
  const confirmExit = () => {
    if (unsaved.length === 0) return onExit();
    const message = `${unsaved.length} scanned ${unsaved.length === 1 ? "book hasn't" : "books haven't"} been saved. Discard them?`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) onExit();
    } else {
      Alert.alert("Discard scans?", message, [
        { text: "Keep scanning", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onExit },
      ]);
    }
  };

  const unsaved = rows.filter((r) => r.save !== "saved");
  const saveable = unsaved.filter((r) => r.book);
  const skipped = unsaved.length - saveable.length;
  const rowStatus = (r: Row) =>
    r.save === "saved" ? "Saved" : r.save === "failed" ? "Save failed" : r.lookup === "loading" ? "Looking up" : r.lookup === "error" ? "Not found" : "Ready";

  const list = (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.isbn}
      style={styles.list}
      ListEmptyComponent={<Text style={styles.muted}>No books scanned yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row} accessible accessibilityLabel={`${item.book?.title ?? item.isbn}, ${rowStatus(item)}`}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.book?.title ?? item.isbn}</Text>
            <Text style={styles.muted}>{rowStatus(item)}</Text>
          </View>
          {item.lookup === "error" && (
            <Button variant="pill" onPress={() => resolve(item.isbn)} accessibilityLabel={`Retry lookup for ${item.isbn}`}>Retry</Button>
          )}
          {item.save === "failed" && (
            <Button variant="pill" onPress={() => saveRows([item])} disabled={saving} accessibilityLabel={`Retry saving ${item.book?.title ?? item.isbn}`}>Retry</Button>
          )}
        </View>
      )}
    />
  );

  if (finishing) {
    return (
      <View style={styles.finish}>
        <Text style={styles.heading} accessibilityRole="header">Save {rows.length} scanned {rows.length === 1 ? "book" : "books"}</Text>
        <TextInput
          style={styles.input}
          value={tag}
          onChangeText={setTag}
          placeholder="Optional tag for all, e.g. Garage sale"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Optional tag to add to every saved book"
        />
        {list}
        {skipped > 0 && (
          <Text style={styles.muted} accessibilityLiveRegion="polite">
            {skipped} {skipped === 1 ? "book" : "books"} not found yet and will be skipped. Retry the lookup or close to discard.
          </Text>
        )}
        <Button
          variant="primary"
          onPress={() => saveRows(saveable)}
          disabled={saving || saveable.length === 0}
          accessibilityLabel={saving ? "Saving" : saveable.length ? `Save ${saveable.length} books` : "Nothing to save"}
        >
          {saving ? "Saving..." : saveable.length ? `Save ${saveable.length}` : unsaved.length ? "Nothing to save" : "All saved"}
        </Button>
        <Button variant="pill" onPress={() => setFinishing(false)} accessibilityLabel="Back to scanning">Keep scanning</Button>
        <Button variant="pill" onPress={confirmExit} accessibilityLabel="Close batch scan">Close</Button>
      </View>
    );
  }

  // Camera stays dark regardless of theme, as in single-scan mode.
  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13"] }}
        onBarcodeScanned={handleScanned}
      />
      <View style={styles.panel}>
        <Text style={styles.toast} accessibilityLiveRegion="polite">{toast}</Text>
        <Text style={styles.count}>{rows.length} scanned</Text>
        <View style={styles.typedRow}>
          <TextInput
            style={[styles.input, styles.typedInput]}
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={handleTyped}
            keyboardType="number-pad"
            placeholder="Type an ISBN"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ISBN to add"
          />
          <Button variant="pill" onPress={handleTyped} accessibilityLabel="Add typed ISBN">Add</Button>
        </View>
        <Button variant="primary" onPress={() => setFinishing(true)} accessibilityLabel={`Finish, review ${rows.length} scanned books`}>Finish</Button>
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    camera: { flex: 1, backgroundColor: "#000", justifyContent: "flex-end" },
    panel: { padding: spacing.lg, gap: spacing.sm, backgroundColor: "rgba(0,0,0,0.6)" },
    toast: { color: "#fff", fontFamily: fonts.body, fontSize: 14, minHeight: 20, textAlign: "center" },
    count: { color: "#fff", fontFamily: fonts.body, fontSize: 14, textAlign: "center" },
    typedRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
    typedInput: { flex: 1 },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 8,
      padding: spacing.sm,
      backgroundColor: colors.paper,
      color: colors.ink,
      fontFamily: fonts.body,
    },
    finish: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.paper },
    heading: { fontFamily: fonts.body, fontSize: typeScale.sm, fontWeight: "700", color: colors.ink },
    list: { flex: 1 },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
    rowText: { flex: 1 },
    rowTitle: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  });
}
