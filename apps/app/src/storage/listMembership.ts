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

/** True when `checked` leaves a list-held member on none of `lists`, so saving would unsave it and drop its notes. */
export function leavesLibrary(lists: SavedList[], member: Pick<ListMember, "type" | "id">, checked: Set<string>): boolean {
  const { remove } = listChanges(lists, member, checked);
  return remove.length > 0 && !lists.some((l) => checked.has(l.id));
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
 * (which would unsave it and lose its notes). `save` runs whenever the member ends up on a list.
 */
export async function applyListChanges(member: Member, changes: { add: string[]; remove: string[] }, save: () => Promise<unknown>): Promise<void> {
  for (const id of changes.add) await addToList(id, member);
  for (const id of changes.remove) await removeFromList(id, member.type, member.id);
  // Saving is idempotent, so also run it for a member already listed but unsaved.
  if (!(await unsaveIfUnlisted(member))) await save();
}

/** Deletes the list, then unsaves each of its members that no other list holds. */
export async function deleteListAndUnsave(listId: string): Promise<void> {
  const members = (await getList(listId))?.members ?? [];
  await deleteList(listId);
  for (const m of members) await unsaveIfUnlisted(m);
}
