import { MAX_IMPORT_BYTES, MAX_IMPORT_RECORDS, SnapshotExportSchema, type Book, type SnapshotExport } from "@book-explorer/shared";
import { fetchBookWithAlternate } from "./api/bookLookup";
import { stopsPass } from "./prefetchSaved";
import { booksToCsv, readBookCsv, type CsvBookRow } from "./csv";
import { mergeSnapshots } from "./storage/mergeSnapshot";
import { getSavedBook, saveBook } from "./storage/savedBooks";
import { SCHEMA_VERSION } from "./storage/schema";
import { applySnapshot, getSnapshot, snapshotForList, withListedSaves, withWorkRecords, type Snapshot } from "./storage/snapshot";

// Fails to compile unless the shared import schema and the stored Snapshot are the same
// type, so a field added to a stored record can't be silently stripped on import.
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const schemaMatchesStorage: Same<SnapshotExport, Snapshot> = true;
void schemaMatchesStorage;

/** A backup can't be imported (or made); the message is shown to the user as is. */
export class ImportError extends Error {}

function checkSize(text: string) {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError("That file is too large to import (5 MB max).");
}

const SNAPSHOT_PARTS: Record<string, string> = {
  items: "a saved item",
  books: "a saved book",
  works: "a saved work",
  libraries: "a library in Settings",
  lists: "a list",
};

export const exportJson = async (): Promise<string> => exportSnapshot(await getSnapshot());

export const exportListJson = async (listId: string): Promise<string> => exportSnapshot(snapshotForList(await getSnapshot(), listId));

function exportSnapshot(snapshot: Snapshot): string {
  // Import rejects the whole file over one bad record, so a backup that couldn't be restored
  // fails now, while the data is still on this device, not when the user restores it.
  const check = SnapshotExportSchema.safeParse(snapshot);
  if (!check.success) {
    const part = SNAPSHOT_PARTS[String(check.error.issues[0]?.path[0])] ?? "some saved data";
    throw new ImportError(`This backup couldn't be restored, so it wasn't made: ${part} has a value that's too long or not allowed. Fix it and try again.`);
  }
  return JSON.stringify(snapshot, null, 2);
}

export async function exportCsv(workIsbn?: (workId: string) => string | null): Promise<string> {
  const { books, lists, works } = await getSnapshot();
  return booksToCsv(books, lists, works, workIsbn);
}

export async function exportListCsv(listId: string, workIsbn?: (workId: string) => string | null): Promise<string> {
  const { books, lists, works } = snapshotForList(await getSnapshot(), listId);
  return booksToCsv(books, lists, works, workIsbn);
}

/** Validates a JSON backup file (untrusted) against the shared schema. */
export function parseSnapshotJson(text: string): Snapshot {
  checkSize(text);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError("That file isn't valid JSON.");
  }
  const result = SnapshotExportSchema.safeParse(json);
  if (!result.success) throw new ImportError("That file isn't a Shelf Thread backup, or it's damaged.");
  if (result.data.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError("That backup is from a newer version of Shelf Thread. Update the app to import it.");
  }
  return result.data;
}

/** Merge: union with what's saved, newer edit wins per record. Replace: the backup becomes the whole dataset. */
export async function importSnapshot(imported: Snapshot, mode: "merge" | "replace"): Promise<void> {
  // After the merge, so a v1 backup's saves get a list only where neither side has one, and so a v1 backup's work items only get a blank record where neither side has one.
  await applySnapshot(withWorkRecords(withListedSaves(mode === "replace" ? imported : mergeSnapshots(await getSnapshot(), imported))));
}

export function parseBookCsv(text: string): CsvBookRow[] {
  checkSize(text);
  let rows: CsvBookRow[];
  try {
    rows = readBookCsv(text);
  } catch (err) {
    throw new ImportError((err as Error).message);
  }
  if (rows.length > MAX_IMPORT_RECORDS) throw new ImportError(`That file has more than ${MAX_IMPORT_RECORDS} books.`);
  return rows;
}

export interface CsvImportProgress {
  next: number; // index of the next row to import; resuming starts here
  saved: number;
  alreadySaved: number;
  noIsbn: string[]; // titles of rows skipped for having no ISBN
  failed: string[]; // titles (or ISBNs) whose lookup failed
}

export const NEW_CSV_IMPORT: CsvImportProgress = { next: 0, saved: 0, alreadySaved: 0, noIsbn: [], failed: [] };

// The server allows 100 requests a minute per client and a lookup can take two
// (ISBN-10/13 retry), so this keeps an import under the limit with room to browse.
const LOOKUP_GAP_MS = 1500;

/**
 * Saves each row's book through the same path as the book page's Save button,
 * one lookup at a time. Stops between rows once `isStopped()` is true; pass the
 * returned progress back in to resume. Books already saved are skipped without
 * a lookup, so re-importing the same file after a restart also picks up where it left off.
 * `onSaved` gets each newly saved book, so the caller can cache it for offline use.
 */
export async function runCsvImport(
  rows: CsvBookRow[],
  from: CsvImportProgress,
  {
    onProgress,
    isStopped,
    onSaved,
    gapMs = LOOKUP_GAP_MS,
  }: { onProgress: (p: CsvImportProgress) => void; isStopped: () => boolean; onSaved?: (book: Book) => void; gapMs?: number }
): Promise<CsvImportProgress> {
  const p = { ...from, noIsbn: [...from.noIsbn], failed: [...from.failed] };
  while (p.next < rows.length && !isStopped()) {
    const { title, isbn } = rows[p.next];
    if (!isbn) p.noIsbn.push(title || `Row ${p.next + 2}`); // +2: 1-based, after the header
    else if (await getSavedBook(isbn)) p.alreadySaved++;
    else {
      try {
        const book = await fetchBookWithAlternate(isbn);
        await saveBook(book);
        onSaved?.(book);
        p.saved++;
      } catch (err) {
        if (stopsPass(err)) return p; // throttled or offline: leave this row for Resume rather than failing every row after it
        p.failed.push(title || isbn);
      }
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
    p.next++;
    onProgress({ ...p, noIsbn: [...p.noIsbn], failed: [...p.failed] });
  }
  return p;
}
