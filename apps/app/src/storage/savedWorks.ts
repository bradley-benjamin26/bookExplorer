import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Work } from "@book-explorer/shared";
import { withoutContent } from "./savedBooks";
import { ensureSaved, removeSaved } from "./savedItems";
import { stamp, type Versioned } from "./schema";
import { enqueueWrite } from "./writeQueue";

// One key per saved work, for the same reason as savedBooks.ts.
const KEY_PREFIX = "book-explorer:saved-work:";

function storageKey(workId: string): string {
  return `${KEY_PREFIX}${workId}`;
}

/**
 * A saved work's editable record, keyed by Open Library work id (the id
 * `savedItems` uses for a "work" entry). Like SavedBookRecord, its subjects
 * and genres start as the API's and are the user's to edit from then on.
 */
export interface SavedWorkRecord extends Versioned {
  deletedAt?: number; // tombstone, see SavedItem
  openLibraryWorkId: string;
  title: string;
  authorNames: string[];
  subjects: string[];
  genres: string[];
  notes: string;
  savedAt: number;
}

export type SavedWorkChanges = Partial<Pick<SavedWorkRecord, "subjects" | "genres" | "notes">>;

async function readRecord(workId: string): Promise<SavedWorkRecord | null> {
  const raw = await AsyncStorage.getItem(storageKey(workId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedWorkRecord;
  } catch {
    return null;
  }
}

/** Creates the record on first save, from the currently-fetched work. */
export function saveWorkFromApi(work: Work): Promise<SavedWorkRecord> {
  return enqueueWrite(storageKey(work.openLibraryWorkId), async () => {
    const existing = await readRecord(work.openLibraryWorkId);
    if (existing && !existing.deletedAt) return existing;

    const record: SavedWorkRecord = stamp({
      openLibraryWorkId: work.openLibraryWorkId,
      title: work.title,
      authorNames: work.authors.map((a) => a.name),
      subjects: work.subjects.map((t) => t.label),
      genres: work.genres.map((t) => t.label),
      notes: "",
      savedAt: Date.now(),
    });
    await AsyncStorage.setItem(storageKey(work.openLibraryWorkId), JSON.stringify(record));
    return record;
  });
}

/** Queued behind pending writes to this work, like getSavedBook. */
export function getSavedWork(workId: string): Promise<SavedWorkRecord | null> {
  return enqueueWrite(storageKey(workId), async () => {
    const record = await readRecord(workId);
    return record?.deletedAt ? null : record;
  });
}

export function updateSavedWork(workId: string, changes: SavedWorkChanges): Promise<SavedWorkRecord | null> {
  return enqueueWrite(storageKey(workId), async () => {
    const existing = await readRecord(workId);
    if (!existing || existing.deletedAt) return null;
    const next = { ...existing, ...changes, updatedAt: Date.now() };
    await AsyncStorage.setItem(storageKey(workId), JSON.stringify(next));
    return next;
  });
}

/**
 * Fills a record that has never had API tags (one made by the v2 migration or a v1 import) from `work`, once.
 * Users never edit `authorNames`, so a record with authors keeps whatever tags the user left, even none.
 * Returns the seeded record, or null when nothing was written.
 */
export function seedSavedWorkFromApi(workId: string, work: Work): Promise<SavedWorkRecord | null> {
  return enqueueWrite(storageKey(workId), async () => {
    const existing = await readRecord(workId);
    if (!existing || existing.deletedAt || existing.authorNames.length + existing.subjects.length + existing.genres.length > 0) return null;
    const seeded = {
      authorNames: work.authors.map((a) => a.name),
      subjects: work.subjects.map((t) => t.label),
      genres: work.genres.map((t) => t.label),
    };
    if (seeded.authorNames.length + seeded.subjects.length + seeded.genres.length === 0) return null;
    const next = { ...existing, ...seeded, updatedAt: Date.now() };
    await AsyncStorage.setItem(storageKey(workId), JSON.stringify(next));
    return next;
  });
}

export function removeSavedWork(workId: string): Promise<void> {
  return enqueueWrite(storageKey(workId), async () => {
    const existing = await readRecord(workId);
    if (!existing || existing.deletedAt) return;
    const now = Date.now();
    await AsyncStorage.setItem(storageKey(workId), JSON.stringify(withoutContent({ ...existing, updatedAt: now, deletedAt: now })));
  });
}

/** Saves a work (record, then the Saved-screen index) without ever removing it. */
export async function saveWork(work: Work): Promise<SavedWorkRecord> {
  const record = await saveWorkFromApi(work);
  await ensureSaved({ type: "work", id: work.openLibraryWorkId, title: work.title });
  return record;
}

/** Removes a saved work from the index and tombstones its record. */
export async function unsaveWork(workId: string): Promise<void> {
  await removeSaved("work", workId);
  await removeSavedWork(workId);
}

/** Every stored record, tombstones included — for the snapshot. */
export async function getAllSavedWorks(): Promise<SavedWorkRecord[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
  const records = await Promise.all(
    keys.map((k) => k.slice(KEY_PREFIX.length)).map((id) => enqueueWrite(storageKey(id), () => readRecord(id)))
  );
  return records.filter((r): r is SavedWorkRecord => r !== null);
}

/** Replaces every stored record with the given ones (snapshot import). */
export async function replaceSavedWorks(records: SavedWorkRecord[]): Promise<void> {
  const keep = new Set(records.map((r) => r.openLibraryWorkId));
  const existing = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
  await Promise.all([
    ...existing
      .map((k) => k.slice(KEY_PREFIX.length))
      .filter((id) => !keep.has(id))
      .map((id) => enqueueWrite(storageKey(id), () => AsyncStorage.removeItem(storageKey(id)))),
    ...records.map((r) =>
      enqueueWrite(storageKey(r.openLibraryWorkId), () => AsyncStorage.setItem(storageKey(r.openLibraryWorkId), JSON.stringify(r)))
    ),
  ]);
}
