import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Book } from "@book-explorer/shared";
import { stamp, type Versioned } from "./schema";
import { enqueueWrite } from "./writeQueue";

// Each saved book gets its own AsyncStorage key, rather than all of them
// sharing one JSON blob under a single key — reading or writing one book's
// record (e.g. adding a single tag) then only touches that one key instead
// of reading, re-serializing, and rewriting every other saved book's data
// too. Nothing in this app currently needs to list every saved book at once
// (the Saved screen's list comes from the separate, lightweight
// `savedItems` index instead), so there's no listing operation to give up
// by splitting the storage this way.
const KEY_PREFIX = "book-explorer:saved-book:";

function storageKey(isbn: string): string {
  return `${KEY_PREFIX}${isbn}`;
}

/**
 * A saved book's editable record, keyed by ISBN (the same per-edition key
 * `savedItems` already uses for a "book" entry). `subjects` and `genres`
 * start as a snapshot of whatever the external sources returned at save
 * time, then the user can add to or remove from them directly — there's no
 * separate "pulled in" vs "user added" list, since once a book is saved its
 * record is the source of truth a later lookup overrides external data
 * with, not just an addendum to it.
 */
export interface SavedBookRecord extends Versioned {
  deletedAt?: number; // tombstone, see SavedItem
  isbn: string;
  wikidataId: string | null;
  openLibraryEditionId: string | null;
  openLibraryWorkId: string | null;
  title: string;
  authorNames: string[];
  format: string | null;
  subjects: string[];
  genres: string[];
  notes: string;
  savedAt: number;
}

async function readRecord(isbn: string): Promise<SavedBookRecord | null> {
  const raw = await AsyncStorage.getItem(storageKey(isbn));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedBookRecord;
  } catch {
    return null;
  }
}

/** Creates the record on first save, from the currently-fetched external data. */
export function saveBookFromApi(book: Book): Promise<SavedBookRecord> {
  return enqueueWrite(storageKey(book.isbn), async () => {
    const existing = await readRecord(book.isbn);
    if (existing && !existing.deletedAt) return existing;

    const record: SavedBookRecord = stamp({
      isbn: book.isbn,
      wikidataId: book.wikidataId,
      openLibraryEditionId: book.openLibraryEditionId,
      openLibraryWorkId: book.openLibraryWorkId,
      title: book.title,
      authorNames: book.authors.map((a) => a.name),
      format: book.format,
      subjects: book.subjects.map((t) => t.label),
      genres: book.genres.map((t) => t.label),
      notes: "",
      savedAt: Date.now(),
    });
    await AsyncStorage.setItem(storageKey(book.isbn), JSON.stringify(record));
    return record;
  });
}

/**
 * Waits for any queued writes to this book first, so a screen re-reading on focus (e.g.
 * the book page after a removal or edit on the Saved screen) sees their
 * result rather than the record as it was before they landed.
 */
export function getSavedBook(isbn: string): Promise<SavedBookRecord | null> {
  return enqueueWrite(storageKey(isbn), async () => {
    const record = await readRecord(isbn);
    return record?.deletedAt ? null : record;
  });
}

export function updateSavedBook(
  isbn: string,
  changes: Partial<Pick<SavedBookRecord, "subjects" | "genres" | "notes">>
): Promise<SavedBookRecord | null> {
  return enqueueWrite(storageKey(isbn), async () => {
    const existing = await readRecord(isbn);
    if (!existing || existing.deletedAt) return null;
    const next = { ...existing, ...changes, updatedAt: Date.now() };
    await AsyncStorage.setItem(storageKey(isbn), JSON.stringify(next));
    return next;
  });
}

export function removeSavedBook(isbn: string): Promise<void> {
  return enqueueWrite(storageKey(isbn), async () => {
    const existing = await readRecord(isbn);
    if (!existing || existing.deletedAt) return;
    const now = Date.now();
    await AsyncStorage.setItem(storageKey(isbn), JSON.stringify({ ...existing, updatedAt: now, deletedAt: now }));
  });
}

/** Every stored record, tombstones included — for the snapshot. */
export async function getAllSavedBooks(): Promise<SavedBookRecord[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
  const records = await Promise.all(keys.map((k) => getSavedBookRaw(k.slice(KEY_PREFIX.length))));
  return records.filter((r): r is SavedBookRecord => r !== null);
}

function getSavedBookRaw(isbn: string): Promise<SavedBookRecord | null> {
  return enqueueWrite(storageKey(isbn), () => readRecord(isbn));
}

/** Replaces every stored record with the given ones (snapshot import). */
export async function replaceSavedBooks(records: SavedBookRecord[]): Promise<void> {
  const keep = new Set(records.map((r) => r.isbn));
  const existing = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
  await Promise.all([
    ...existing
      .map((k) => k.slice(KEY_PREFIX.length))
      .filter((isbn) => !keep.has(isbn))
      .map((isbn) => enqueueWrite(storageKey(isbn), () => AsyncStorage.removeItem(storageKey(isbn)))),
    ...records.map((r) => enqueueWrite(storageKey(r.isbn), () => AsyncStorage.setItem(storageKey(r.isbn), JSON.stringify(r)))),
  ]);
}
