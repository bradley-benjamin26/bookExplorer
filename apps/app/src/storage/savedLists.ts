import AsyncStorage from "@react-native-async-storage/async-storage";
import { stamp, type Versioned } from "./schema";
import { enqueueWrite } from "./writeQueue";

// One key for every list, like libraries: there are few, and they're read together.
const KEY = "book-explorer:saved-lists";

const MAX_NAME = 100;
const MAX_DESCRIPTION = 1_000;

/** A list holds ids and titles only, so it never needs a lookup to show. */
export interface ListMember {
  type: "book" | "work" | "author";
  id: string;
  title: string;
  addedAt: number;
}

export interface SavedList extends Versioned {
  id: string;
  name: string;
  description: string;
  kind: "book" | "author"; // a book list holds books and works
  members: ListMember[];
  createdAt: number;
  deletedAt?: number; // tombstone, see SavedItem
}

async function read(): Promise<SavedList[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const write = (lists: SavedList[]) => AsyncStorage.setItem(KEY, JSON.stringify(lists));

/** Applies `change` to the live list `id`; throws when there's no such list. */
function updateList(id: string, change: (list: SavedList) => SavedList): Promise<void> {
  return enqueueWrite(KEY, async () => {
    const lists = await read();
    const index = lists.findIndex((l) => l.id === id && !l.deletedAt);
    if (index === -1) throw new Error("That list no longer exists.");
    const next = change(lists[index]);
    if (next === lists[index]) return;
    lists[index] = { ...next, updatedAt: Date.now() };
    await write(lists);
  });
}

/** Every stored list, tombstones included — for the snapshot. */
export function getAllLists(): Promise<SavedList[]> {
  return enqueueWrite(KEY, read);
}

/** Live lists, newest first, optionally only one kind. */
export async function getLists(kind?: SavedList["kind"]): Promise<SavedList[]> {
  return (await getAllLists()).filter((l) => !l.deletedAt && (!kind || l.kind === kind)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getList(id: string): Promise<SavedList | null> {
  return (await getAllLists()).find((l) => l.id === id && !l.deletedAt) ?? null;
}

export function createList(input: { name: string; description?: string; kind: SavedList["kind"] }): Promise<SavedList> {
  const name = input.name.trim();
  const description = (input.description ?? "").trim();
  // The export schema rejects these, so storing one would break every later backup.
  if (!name) return Promise.reject(new Error("A list needs a name."));
  if (name.length > MAX_NAME) return Promise.reject(new Error(`A list name can be at most ${MAX_NAME} characters.`));
  if (description.length > MAX_DESCRIPTION) return Promise.reject(new Error(`A description can be at most ${MAX_DESCRIPTION} characters.`));
  return enqueueWrite(KEY, async () => {
    const now = Date.now();
    const list: SavedList = stamp({
      id: `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      kind: input.kind,
      members: [],
      createdAt: now,
    });
    await write([...(await read()), list]);
    return list;
  });
}

/** Adds `member` unless it's already there. Throws if its type doesn't fit the list's kind. */
export function addToList(listId: string, member: Omit<ListMember, "addedAt">): Promise<void> {
  return updateList(listId, (list) => {
    if ((list.kind === "author") !== (member.type === "author")) throw new Error(`That can't go on a list of ${list.kind}s.`);
    if (list.members.some((m) => m.type === member.type && m.id === member.id)) return list;
    return { ...list, members: [...list.members, { ...member, addedAt: Date.now() }] };
  });
}

export function removeFromList(listId: string, type: ListMember["type"], id: string): Promise<void> {
  return updateList(listId, (list) =>
    list.members.some((m) => m.type === type && m.id === id) ? { ...list, members: list.members.filter((m) => !(m.type === type && m.id === id)) } : list
  );
}

/** Tombstones the list, dropping its members and description as removeSavedBook drops notes. */
export function deleteList(id: string): Promise<void> {
  return enqueueWrite(KEY, async () => {
    const lists = await read();
    const now = Date.now();
    if (!lists.some((l) => l.id === id && !l.deletedAt)) return;
    await write(lists.map((l) => (l.id === id ? { ...l, description: "", members: [], updatedAt: now, deletedAt: now } : l)));
  });
}

/** Replaces every list with the given ones (snapshot import). */
export function replaceLists(lists: SavedList[]): Promise<void> {
  return enqueueWrite(KEY, () => write(lists));
}
