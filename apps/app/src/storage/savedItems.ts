import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureOnAList } from "./savedLists";
import { stamp, type Unversioned, type Versioned } from "./schema";
import { enqueueWrite } from "./writeQueue";

const SAVED_KEY = "book-explorer:saved-items";

export interface SavedItem extends Versioned {
  deletedAt?: number; // tombstone: set instead of deleting, so a future sync can propagate the removal
  type: "book" | "work" | "author";
  id: string; // isbn for a book, openLibraryWorkId for a work, openLibraryId for an author
  title: string;
}

function itemKey(type: SavedItem["type"], id: string): string {
  return `${type}:${id}`;
}

/** Every stored item, tombstones included — for the snapshot; screens want getSavedItems. */
export async function getAllSavedItems(): Promise<SavedItem[]> {
  const raw = await AsyncStorage.getItem(SAVED_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedItem[];
  } catch {
    return [];
  }
}

export async function getSavedItems(): Promise<SavedItem[]> {
  return (await getAllSavedItems()).filter((i) => !i.deletedAt);
}

function write(items: SavedItem[]): Promise<void> {
  return AsyncStorage.setItem(SAVED_KEY, JSON.stringify(items));
}

function tombstone(items: SavedItem[], key: string): SavedItem[] {
  const now = Date.now();
  return items.map((i) => (itemKey(i.type, i.id) === key && !i.deletedAt ? { ...i, updatedAt: now, deletedAt: now } : i));
}

/** Idempotent save: does nothing if the item is already saved. */
export function ensureSaved(item: Unversioned<SavedItem>): Promise<void> {
  return enqueueWrite(SAVED_KEY, async () => {
    const items = await getAllSavedItems();
    const key = itemKey(item.type, item.id);
    if (items.some((i) => itemKey(i.type, i.id) === key && !i.deletedAt)) return;
    await write([stamp(item), ...items.filter((i) => itemKey(i.type, i.id) !== key)]);
  });
}

export function removeSaved(type: SavedItem["type"], id: string): Promise<void> {
  return enqueueWrite(SAVED_KEY, async () => write(tombstone(await getAllSavedItems(), itemKey(type, id))));
}

/** Replaces the whole stored list (snapshot import). */
export function replaceSavedItems(items: SavedItem[]): Promise<void> {
  return enqueueWrite(SAVED_KEY, () => write(items));
}

/** Saves an author and puts them on a list (Saved authors unless already on one). */
export async function saveAuthor(id: string, name: string): Promise<void> {
  await ensureSaved({ type: "author", id, title: name });
  await ensureOnAList({ type: "author", id, title: name });
}
