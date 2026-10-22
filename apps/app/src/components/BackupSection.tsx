import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  exportCsv,
  exportJson,
  ImportError,
  importSnapshot,
  NEW_CSV_IMPORT,
  parseBookCsv,
  parseSnapshotJson,
  runCsvImport,
  type CsvImportProgress,
} from "../backup";
import { pickFileText, shareFile } from "../backupFiles";
import type { CsvBookRow } from "../csv";
import type { Snapshot } from "../storage/snapshot";
import { useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";

const today = () => new Date().toISOString().slice(0, 10);

/** Export/import of the saved library, on the Saved screen. `onImported` reloads the screen's lists. */
export function BackupSection({ onImported }: { onImported: () => void }) {
  const styles = useThemedStyles(createStyles);
  const [message, setMessage] = useState("");
  const [pendingBackup, setPendingBackup] = useState<Snapshot | null>(null);
  const [csv, setCsv] = useState<{ rows: CsvBookRow[]; progress: CsvImportProgress; running: boolean } | null>(null);
  const stopRequested = useRef(false);
  const queryClient = useQueryClient();
  // Leaving the screen pauses a running CSV import, so it can't run on unseen or overlap one started on return.
  useEffect(() => () => {
    stopRequested.current = true;
  }, []);

  // Any failure is shown inline; an ImportError's message is written for the user.
  const attempt = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof ImportError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const pickBackup = () =>
    attempt(async () => {
      const text = await pickFileText(".json,application/json");
      if (text === null) return;
      setPendingBackup(parseSnapshotJson(text));
      setMessage("");
    });

  const applyBackup = (mode: "merge" | "replace") =>
    attempt(async () => {
      if (!pendingBackup) return;
      await importSnapshot(pendingBackup, mode);
      setPendingBackup(null);
      setMessage(mode === "merge" ? "Backup merged into your library." : "Your library was replaced with the backup.");
      onImported();
    });

  const runCsv = async (rows: CsvBookRow[], from: CsvImportProgress) => {
    stopRequested.current = false;
    let last = from;
    setCsv({ rows, progress: from, running: true });
    try {
      last = await runCsvImport(rows, from, {
        onProgress: (p) => {
          last = p;
          setCsv({ rows, progress: p, running: true });
        },
        isStopped: () => stopRequested.current,
        // Seeds the offline cache and keeps the cover on disk, as opening the book page would.
        onSaved: (book) => {
          queryClient.setQueryData(["book", book.isbn], book);
          if (book.coverUrl) Image.prefetch(book.coverUrl, "disk");
        },
      });
    } finally {
      // Even after a throw, so the Resume button and backup import come back.
      setCsv({ rows, progress: last, running: false });
      onImported();
    }
  };

  const pickCsv = () =>
    attempt(async () => {
      const text = await pickFileText(".csv,text/csv");
      if (text === null) return;
      setMessage("");
      await runCsv(parseBookCsv(text), NEW_CSV_IMPORT);
    });

  const progress = csv?.progress;
  const finished = csv && progress && progress.next >= csv.rows.length;

  return (
    <View>
      <Text style={styles.sectionTitle}>Export & Import</Text>
      <Text style={styles.helpText}>
        A backup holds your saved books, authors, tags, notes and libraries. The CSV has your books in Goodreads' format.
      </Text>
      <View style={styles.buttons}>
        <Button
          variant="pill"
          onPress={() => attempt(async () => shareFile(`book-explorer-${today()}.json`, await exportJson(), "application/json"))}
          accessibilityLabel="Export backup as JSON"
        >
          Export backup
        </Button>
        <Button
          variant="pill"
          onPress={() => attempt(async () => shareFile(`book-explorer-books-${today()}.csv`, await exportCsv(), "text/csv"))}
          accessibilityLabel="Export books as CSV"
        >
          Export CSV
        </Button>
        {/* One import at a time: a backup merge/replace mid-CSV would race the CSV's saves. */}
        {!csv?.running && (
          <Button variant="pill" onPress={pickBackup} accessibilityLabel="Import backup from a JSON file">
            Import backup
          </Button>
        )}
        {!csv?.running && (
          <Button variant="pill" onPress={pickCsv} accessibilityLabel="Import books from a Goodreads or StoryGraph CSV file">
            Import Goodreads / StoryGraph CSV
          </Button>
        )}
      </View>

      {pendingBackup && !csv?.running && (
        <View style={styles.panel}>
          <Text style={styles.bodyText}>
            Backup has {pendingBackup.items.filter((i) => !i.deletedAt).length} saved items. Merge keeps the newer copy of
            anything in both; Replace discards what's saved here now.
          </Text>
          <View style={styles.buttons}>
            <Button variant="pill" onPress={() => applyBackup("merge")} accessibilityLabel="Merge backup into my library">
              Merge
            </Button>
            <Button variant="pill" onPress={() => applyBackup("replace")} accessibilityLabel="Replace my library with backup">
              Replace
            </Button>
            <Button variant="pill" onPress={() => setPendingBackup(null)} accessibilityLabel="Cancel backup import">
              Cancel
            </Button>
          </View>
        </View>
      )}

      {csv && progress && (
        <View style={styles.panel}>
          <Text style={styles.bodyText} accessibilityLiveRegion="polite">
            {finished ? "CSV import finished" : csv.running ? "Importing" : "Import paused"}: {progress.next} of{" "}
            {csv.rows.length} rows — {progress.saved} saved, {progress.alreadySaved} already saved.
          </Text>
          {csv.running ? (
            <Button variant="pill" onPress={() => (stopRequested.current = true)} accessibilityLabel="Pause CSV import">
              Pause
            </Button>
          ) : (
            !finished && (
              <Button variant="pill" onPress={() => attempt(() => runCsv(csv.rows, progress))} accessibilityLabel="Resume CSV import">
                Resume
              </Button>
            )
          )}
          {finished && progress.noIsbn.length > 0 && (
            <Text style={styles.bodyText}>Skipped, no ISBN: {progress.noIsbn.join("; ")}</Text>
          )}
          {finished && progress.failed.length > 0 && (
            <Text style={styles.bodyText}>Couldn't look up: {progress.failed.join("; ")}</Text>
          )}
        </View>
      )}

      {message ? (
        <Text style={styles.bodyText} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    sectionTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: typeScale.md,
      color: colors.ink,
      marginTop: spacing.xxl,
      marginBottom: spacing.md,
    },
    helpText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, lineHeight: 20, marginBottom: spacing.md },
    bodyText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.ink, lineHeight: 20, marginTop: spacing.sm },
    buttons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    panel: {
      marginTop: spacing.md,
      padding: spacing.lg,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radii.sm,
    },
  });
}
