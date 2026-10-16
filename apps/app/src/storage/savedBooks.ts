import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Book } from "@book-explorer/shared";

// Each saved book gets its own AsyncStorage key, rather than all of them
// sharing one JSON blob under a single key — reading or writing one book's
// record (e.g. adding a single tag) then only touches that one key instead
// of reading, re-serializing, and rewriting every other saved book's data
// too. Nothing in this app currently needs to list every saved book at once
// (the Saved screen's list comes from the separate, lightweight
// `savedItems` index instead), so there's no listing operation to give up
// by splitting the storage this way.
function storageKey(isbn: string): string {
  return `book-explorer:saved-book:${isbn}`;
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
export interface SavedBookRecord {
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

// Every write to a record goes through one queue. An update is a
// read-modify-write of the whole record, so two in flight at once (a tag
// removed while a notes save is still pending) would each read the same old
// record and the second write would silently drop the first's change — and
// an update that read the record just before a removal would write it back
// afterwards, resurrecting a book the user just unsaved. Chaining every
// write onto the previous one makes each read see the last write.
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(write: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(write, write);
  writeQueue = result.catch(() => undefined);
  return result;
}

/** Creates the record on first save, from the currently-fetched external data. */
export function saveBookFromApi(book: Book): Promise<SavedBookRecord> {
  return enqueue(async () => {
    const existing = await readRecord(book.isbn);
    if (existing) return existing;

    const record: SavedBookRecord = {
      isbn: book.isbn,
      wikidataId: book.wikidataId,
      openLibraryEditionId: book.openLibraryEditionId,
      openLibraryWorkId: book.openLibraryWorkId,
      title: book.title,
      authorNames: book.authors.map((a) => a.name),
      format: book.format,
      subjects: book.subjects,
      genres: book.genres,
      notes: "",
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(storageKey(book.isbn), JSON.stringify(record));
    return record;
  });
}

/**
 * Waits for any queued writes first, so a screen re-reading on focus (e.g.
 * the book page after a removal or edit on the Saved screen) sees their
 * result rather than the record as it was before they landed.
 */
export function getSavedBook(isbn: string): Promise<SavedBookRecord | null> {
  return writeQueue.then(() => readRecord(isbn));
}

export function updateSavedBook(
  isbn: string,
  changes: Partial<Pick<SavedBookRecord, "subjects" | "genres" | "notes">>
): Promise<SavedBookRecord | null> {
  return enqueue(async () => {
    const existing = await readRecord(isbn);
    if (!existing) return null;
    const next = { ...existing, ...changes };
    await AsyncStorage.setItem(storageKey(isbn), JSON.stringify(next));
    return next;
  });
}

export function removeSavedBook(isbn: string): Promise<void> {
  return enqueue(() => AsyncStorage.removeItem(storageKey(isbn)));
}
