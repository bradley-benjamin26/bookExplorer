import AsyncStorage from "@react-native-async-storage/async-storage";
import { OPEN_LIBRARY_WORK_ID } from "@book-explorer/shared";
import { getLibraries, replaceLibraries, type Library } from "./librarySettings";
import { getAllSavedBooks, replaceSavedBooks, type SavedBookRecord } from "./savedBooks";
import { getAllSavedItems, replaceSavedItems, type SavedItem } from "./savedItems";
import { DEFAULT_LIST_NAMES, getAllLists, newListId, replaceLists, type ListMember, type SavedList } from "./savedLists";
import { getAllSavedWorks, replaceSavedWorks, type SavedWorkRecord } from "./savedWorks";
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
  works: SavedWorkRecord[];
  libraries: Library[];
  lists: SavedList[];
}

// Records written before versioning lack schemaVersion/updatedAt; fill them in on read.
const withStamp = <T extends object>(r: T) => stamp({ updatedAt: (r as { savedAt?: number }).savedAt ?? Date.now(), ...r });

export async function getSnapshot(): Promise<Snapshot> {
  const [items, books, works, libraries, lists] = await Promise.all([
    getAllSavedItems(),
    getAllSavedBooks(),
    getAllSavedWorks(),
    getLibraries(),
    getAllLists(),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    items: items.map(withStamp),
    books: books.map(withStamp),
    works,
    libraries: libraries.map(withStamp),
    lists,
  };
}

/** Writes the snapshot as the full dataset, replacing whatever is stored. Merging is the caller's job. */
export async function applySnapshot(snapshot: Snapshot): Promise<void> {
  await Promise.all([
    replaceSavedItems(snapshot.items),
    replaceSavedBooks(snapshot.books),
    replaceSavedWorks(snapshot.works),
    replaceLibraries(snapshot.libraries),
    replaceLists(snapshot.lists),
  ]);
}

/** One-time upgrade of data saved before versioning; call once at startup. Safe to call repeatedly. */
export async function migrateStorage(): Promise<void> {
  if (Number(await AsyncStorage.getItem(VERSION_KEY)) >= SCHEMA_VERSION) return;
  await applySnapshot(withListedSaves(withWorkRecords(await getSnapshot())));
  await AsyncStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
}

/**
 * v2: each live saved work with no record gets a minimal one, so it can be
 * edited like a new save. Also applied to imports, since a v1 backup has work
 * items but no records. Adds nothing once every live work has a record.
 */
export function withWorkRecords(snapshot: Snapshot): Snapshot {
  const have = new Set(snapshot.works.map((w) => w.openLibraryWorkId));
  const missing: SavedWorkRecord[] = snapshot.items
    // An id the export schema would reject is skipped, or every later backup would fail to import.
    .filter((i) => i.type === "work" && !i.deletedAt && !have.has(i.id) && OPEN_LIBRARY_WORK_ID.test(i.id))
    .map((i) =>
      stamp({ openLibraryWorkId: i.id, title: i.title, authorNames: [], subjects: [], genres: [], notes: "", savedAt: i.updatedAt, updatedAt: i.updatedAt })
    );
  return { ...snapshot, works: [...snapshot.works, ...missing] };
}

/**
 * v4: every live saved item sits on a live list of its kind, so lists can replace saves.
 * Anything on none goes onto the default list (reused by name, else created). Also applied
 * to imports, since an older backup has saves but no lists. Changes nothing once all are listed.
 */
export function withListedSaves(snapshot: Snapshot, now = Date.now()): Snapshot {
  const lists = snapshot.lists.map((l) => ({ ...l }));
  const listed = new Set(lists.filter((l) => !l.deletedAt).flatMap((l) => l.members.map((m) => `${m.type}:${m.id}`)));
  for (const item of snapshot.items) {
    if (item.deletedAt || listed.has(`${item.type}:${item.id}`)) continue;
    const kind: SavedList["kind"] = item.type === "author" ? "author" : "book";
    let list = lists.find((l) => !l.deletedAt && l.kind === kind && l.name === DEFAULT_LIST_NAMES[kind]);
    if (!list) {
      list = stamp({ id: newListId(), name: DEFAULT_LIST_NAMES[kind], description: "", kind, members: [] as ListMember[], createdAt: now, updatedAt: now });
      lists.push(list);
    }
    list.members = [...list.members, { type: item.type, id: item.id, title: item.title, addedAt: now }];
    list.updatedAt = now;
  }
  return { ...snapshot, lists };
}
