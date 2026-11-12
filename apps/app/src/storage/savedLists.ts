import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPreferences } from "./preferences";
import { stamp, type Versioned } from "./schema";
import { enqueueWrite } from "./writeQueue";

// One key for every list, like libraries: there are few, and they're read together.
const KEY = "book-explorer:saved-lists";

const MAX_NAME = 100;
const MAX_DESCRIPTION = 1_000;

/** The lists a save lands on when the user didn't pick one. */
export const DEFAULT_LIST_NAMES: Record<SavedList["kind"], string> = { book: "Saved books", author: "Saved authors" };

export const newListId = () => `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A list holds ids and titles only, so it never needs a lookup to show. */
export interface ListMember {
  type: "book" | "work" | "author";
  id: string;
  title: string;
  addedAt: number;
  hardcoverBookId?: number;
  openLibrarySeed?: string;
}

export interface SavedList extends Versioned {
  id: string;
  name: string;
  description: string;
  kind: "book" | "author"; // a book list holds books and works
  members: ListMember[];
  removedMembers?: { type: ListMember["type"]; id: string; removedAt: number; hardcoverBookId?: number; openLibrarySeed?: string }[]; // so a merge doesn't re-add them from an older copy
  createdAt: number;
  hardcoverListId?: number;
  openLibraryListId?: string;
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
    const now = Date.now();
    const prev = lists[index];
    const has = (l: SavedList, m: { type: string; id: string }) => l.members.some((x) => x.type === m.type && x.id === m.id);
    const removedMembers = [
      ...(next.removedMembers ?? []).filter((r) => !has(next, r)),
      ...prev.members.filter((m) => !has(next, m)).map((m) => ({ type: m.type, id: m.id, removedAt: now, ...(m.hardcoverBookId ? { hardcoverBookId: m.hardcoverBookId } : {}), ...(m.openLibrarySeed ? { openLibrarySeed: m.openLibrarySeed } : {}) })),
    ];
    const { removedMembers: _, ...rest } = next;
    lists[index] = { ...rest, ...(removedMembers.length ? { removedMembers } : {}), updatedAt: now };
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

export function createList(input: { name: string; description?: string; kind: SavedList["kind"]; hardcoverListId?: number; openLibraryListId?: string }): Promise<SavedList> {
  const name = input.name.trim();
  const description = (input.description ?? "").trim();
  // The export schema rejects these, so storing one would break every later backup.
  if (!name) return Promise.reject(new Error("A list needs a name."));
  if (name.length > MAX_NAME) return Promise.reject(new Error(`A list name can be at most ${MAX_NAME} characters.`));
  if (description.length > MAX_DESCRIPTION) return Promise.reject(new Error(`A description can be at most ${MAX_DESCRIPTION} characters.`));
  return enqueueWrite(KEY, async () => {
    const now = Date.now();
    const list: SavedList = stamp({
      id: newListId(),
      name,
      description,
      kind: input.kind,
      members: [],
      createdAt: now,
      ...(input.hardcoverListId ? { hardcoverListId: input.hardcoverListId } : {}),
      ...(input.openLibraryListId ? { openLibraryListId: input.openLibraryListId } : {}),
    });
    await write([...(await read()), list]);
    return list;
  });
}

const kindOf = (type: ListMember["type"]): SavedList["kind"] => (type === "author" ? "author" : "book");
const holds = (l: SavedList, type: ListMember["type"], id: string) => !l.deletedAt && l.members.some((m) => m.type === type && m.id === id);

export async function isOnAnyList(type: ListMember["type"], id: string): Promise<boolean> {
  return (await getAllLists()).some((l) => holds(l, type, id));
}

/** The list a save with no list picked lands on: the chosen one while it's live, else the "Saved …" list if it exists. */
export function defaultListFor(lists: SavedList[], kind: SavedList["kind"], preferredId: string | null): SavedList | undefined {
  const live = lists.filter((l) => !l.deletedAt && l.kind === kind);
  return live.find((l) => l.id === preferredId) ?? live.find((l) => l.name === DEFAULT_LIST_NAMES[kind]);
}

/** Puts `member` on the default list unless some live list already holds it. One queued write, so concurrent calls share one default list. */
export function ensureOnAList(member: Omit<ListMember, "addedAt">): Promise<void> {
  return enqueueWrite(KEY, async () => {
    const lists = await read();
    if (lists.some((l) => holds(l, member.type, member.id))) return;
    const kind = kindOf(member.type);
    const now = Date.now();
    const entry = { ...member, addedAt: now };
    const target = defaultListFor(lists, kind, (await getPreferences()).defaultListIds[kind]);
    const index = target ? lists.indexOf(target) : -1;
    if (index === -1) {
      lists.push(stamp({ id: newListId(), name: DEFAULT_LIST_NAMES[kind], description: "", kind, members: [entry], createdAt: now }));
    } else {
      lists[index] = { ...lists[index], members: [...lists[index].members, entry], updatedAt: now };
    }
    await write(lists);
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

/** Links the list to a Hardcover list, or unlinks it with null (the key is removed so the export schema still validates). */
export function linkList(id: string, hardcoverListId: number | null): Promise<void> {
  return updateList(id, (list) => {
    const { hardcoverListId: _, ...rest } = list;
    return hardcoverListId === null ? rest : { ...rest, hardcoverListId };
  });
}

export function setMemberHardcoverId(listId: string, type: ListMember["type"], id: string, hardcoverBookId: number): Promise<void> {
  return updateList(listId, (list) => ({ ...list, members: list.members.map((m) => (m.type === type && m.id === id ? { ...m, hardcoverBookId } : m)) }));
}

/** Links the list to an Open Library list, or unlinks it with null (the key is removed so the export schema still validates). */
export function linkOpenLibraryList(id: string, openLibraryListId: string | null): Promise<void> {
  return updateList(id, (list) => {
    const { openLibraryListId: _, ...rest } = list;
    if (openLibraryListId !== null) return { ...rest, openLibraryListId };
    // Old seeds would read as pending deletes against whatever list this is copied to next; members' seeds are stripped by that copy.
    return { ...rest, ...(rest.removedMembers ? { removedMembers: rest.removedMembers.map(({ openLibrarySeed: _s, ...r }) => r) } : {}) };
  });
}

export function setMemberOpenLibrarySeed(listId: string, type: ListMember["type"], id: string, openLibrarySeed: string): Promise<void> {
  return updateList(listId, (list) => ({ ...list, members: list.members.map((m) => (m.type === type && m.id === id ? { ...m, openLibrarySeed } : m)) }));
}

export function replaceMembers(listId: string, members: ListMember[]): Promise<void> {
  return updateList(listId, (list) => ({ ...list, members }));
}

/** Tombstones the list, dropping its members and description as removeSavedBook drops notes. */
export function deleteList(id: string): Promise<void> {
  return enqueueWrite(KEY, async () => {
    const lists = await read();
    const now = Date.now();
    if (!lists.some((l) => l.id === id && !l.deletedAt)) return;
    await write(
      lists.map((l) => {
        if (l.id !== id) return l;
        const { removedMembers: _, ...rest } = l;
        return { ...rest, description: "", members: [], updatedAt: now, deletedAt: now };
      })
    );
  });
}

/** Forgets which removed members still need deleting on one service, leaving the other's pending deletes. Not an edit, so updatedAt stays. */
export function settleRemovals(listId: string, service: "hardcover" | "openLibrary" = "hardcover"): Promise<void> {
  return enqueueWrite(KEY, async () => {
    const lists = await read();
    const list = lists.find((l) => l.id === listId);
    if (!list?.removedMembers?.some((r) => (service === "hardcover" ? r.hardcoverBookId : r.openLibrarySeed))) return;
    const drop = service === "hardcover" ? "hardcoverBookId" : "openLibrarySeed";
    list.removedMembers = list.removedMembers.map((r) => {
      const { [drop]: _, ...rest } = r;
      return rest;
    });
    await write(lists);
  });
}

/** Replaces every list with the given ones (snapshot import). */
export function replaceLists(lists: SavedList[]): Promise<void> {
  return enqueueWrite(KEY, () => write(lists));
}
