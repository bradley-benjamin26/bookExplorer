import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Book } from "@book-explorer/shared";

const SAVED_BOOKS_KEY = "book-explorer:saved-books";

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

async function getAllSavedBooks(): Promise<Record<string, SavedBookRecord>> {
  const raw = await AsyncStorage.getItem(SAVED_BOOKS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, SavedBookRecord>;
  } catch {
    return {};
  }
}

async function setAllSavedBooks(records: Record<string, SavedBookRecord>): Promise<void> {
  await AsyncStorage.setItem(SAVED_BOOKS_KEY, JSON.stringify(records));
}

export async function getSavedBook(isbn: string): Promise<SavedBookRecord | null> {
  const all = await getAllSavedBooks();
  return all[isbn] ?? null;
}

/** Creates the record on first save, from the currently-fetched external data. */
export async function saveBookFromApi(book: Book): Promise<SavedBookRecord> {
  const all = await getAllSavedBooks();
  const existing = all[book.isbn];
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
  all[book.isbn] = record;
  await setAllSavedBooks(all);
  return record;
}

export async function updateSavedBook(
  isbn: string,
  changes: Partial<Pick<SavedBookRecord, "subjects" | "genres" | "notes">>
): Promise<SavedBookRecord | null> {
  const all = await getAllSavedBooks();
  const existing = all[isbn];
  if (!existing) return null;
  const next = { ...existing, ...changes };
  all[isbn] = next;
  await setAllSavedBooks(all);
  return next;
}

export async function removeSavedBook(isbn: string): Promise<void> {
  const all = await getAllSavedBooks();
  delete all[isbn];
  await setAllSavedBooks(all);
}
