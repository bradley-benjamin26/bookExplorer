import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLibraries, saveLibraries, type Library } from "./librarySettings";
import { getAllSavedBooks, replaceSavedBooks, type SavedBookRecord } from "./savedBooks";
import { getAllSavedItems, replaceSavedItems, type SavedItem } from "./savedItems";
import { SCHEMA_VERSION, stamp } from "./schema";

const VERSION_KEY = "book-explorer:schema-version";

/**
 * The whole user dataset. Tombstoned items/books are included so a sync can
 * propagate removals. Theme and history (recents) are per-device, so left out.
 */
export interface Snapshot {
  schemaVersion: number;
  items: SavedItem[];
  books: SavedBookRecord[];
  libraries: Library[];
}

// Records written before versioning lack schemaVersion/updatedAt; fill them in on read.
const withStamp = <T extends object>(r: T) => stamp({ updatedAt: (r as { savedAt?: number }).savedAt ?? Date.now(), ...r });

export async function getSnapshot(): Promise<Snapshot> {
  const [items, books, libraries] = await Promise.all([getAllSavedItems(), getAllSavedBooks(), getLibraries()]);
  return {
    schemaVersion: SCHEMA_VERSION,
    items: items.map(withStamp),
    books: books.map(withStamp),
    libraries: libraries.map(withStamp),
  };
}

/** Writes the snapshot as the full dataset, replacing whatever is stored. Merging is the caller's job. */
export async function applySnapshot(snapshot: Snapshot): Promise<void> {
  await Promise.all([replaceSavedItems(snapshot.items), replaceSavedBooks(snapshot.books), saveLibraries(snapshot.libraries)]);
}

/** One-time upgrade of data saved before versioning; call once at startup. Safe to call repeatedly. */
export async function migrateStorage(): Promise<void> {
  if (Number(await AsyncStorage.getItem(VERSION_KEY)) >= SCHEMA_VERSION) return;
  await applySnapshot(await getSnapshot());
  await AsyncStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
}
