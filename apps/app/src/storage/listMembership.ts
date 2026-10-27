import { unsaveBook } from "./savedBooks";
import { removeSaved } from "./savedItems";
import { addToList, deleteList, getList, isOnAnyList, removeFromList, type ListMember, type SavedList } from "./savedLists";
import { unsaveWork } from "./savedWorks";

type Member = Omit<ListMember, "addedAt">;

/** Which lists to add the member to and remove it from so that exactly the `checked` ones hold it. */
export function listChanges(lists: SavedList[], member: Pick<ListMember, "type" | "id">, checked: Set<string>): { add: string[]; remove: string[] } {
  const held = (l: SavedList) => l.members.some((m) => m.type === member.type && m.id === member.id);
  return {
    add: lists.filter((l) => checked.has(l.id) && !held(l)).map((l) => l.id),
    remove: lists.filter((l) => !checked.has(l.id) && held(l)).map((l) => l.id),
  };
}

/** Unsaves `member` (dropping its notes) when no live list holds it; returns whether it did. */
export async function unsaveIfUnlisted(member: Pick<ListMember, "type" | "id">): Promise<boolean> {
  if (await isOnAnyList(member.type, member.id)) return false;
  if (member.type === "book") await unsaveBook(member.id);
  else if (member.type === "work") await unsaveWork(member.id);
  else await removeSaved("author", member.id);
  return true;
}

/**
 * Adds first and removes last, so a move between lists never leaves the item on none
 * (which would unsave it and lose its notes). `save` runs only if something was added.
 */
export async function applyListChanges(member: Member, changes: { add: string[]; remove: string[] }, save: () => Promise<unknown>): Promise<void> {
  for (const id of changes.add) await addToList(id, member);
  if (changes.add.length) await save();
  for (const id of changes.remove) await removeFromList(id, member.type, member.id);
  await unsaveIfUnlisted(member);
}

/** Deletes the list, then unsaves each of its members that no other list holds. */
export async function deleteListAndUnsave(listId: string): Promise<void> {
  const members = (await getList(listId))?.members ?? [];
  await deleteList(listId);
  for (const m of members) await unsaveIfUnlisted(m);
}
