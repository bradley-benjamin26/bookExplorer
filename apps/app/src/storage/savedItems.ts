import AsyncStorage from "@react-native-async-storage/async-storage";

const SAVED_KEY = "book-explorer:saved-items";

export interface SavedItem {
  type: "book" | "work" | "author";
  id: string; // isbn for a book, openLibraryWorkId for a work, openLibraryId for an author
  title: string;
}

function itemKey(type: SavedItem["type"], id: string): string {
  return `${type}:${id}`;
}

export async function getSavedItems(): Promise<SavedItem[]> {
  const raw = await AsyncStorage.getItem(SAVED_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedItem[];
  } catch {
    return [];
  }
}

export async function isItemSaved(type: SavedItem["type"], id: string): Promise<boolean> {
  const items = await getSavedItems();
  return items.some((item) => itemKey(item.type, item.id) === itemKey(type, id));
}

/** Adds or removes the item and returns whether it ended up saved. */
export async function toggleSaved(item: SavedItem): Promise<boolean> {
  const items = await getSavedItems();
  const key = itemKey(item.type, item.id);
  const alreadySaved = items.some((i) => itemKey(i.type, i.id) === key);
  const next = alreadySaved ? items.filter((i) => itemKey(i.type, i.id) !== key) : [item, ...items];
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
  return !alreadySaved;
}

export async function removeSaved(type: SavedItem["type"], id: string): Promise<void> {
  const items = await getSavedItems();
  const next = items.filter((i) => itemKey(i.type, i.id) !== itemKey(type, id));
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
}
