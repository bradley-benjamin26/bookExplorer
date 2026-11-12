import { pushAdd, pushRemove } from "../hardcoverLists";
import { pushOpenLibraryAdd, pushOpenLibraryRemove } from "../openLibraryLists";
import { unsaveIfUnlisted } from "./unlisted";
import { addToList, deleteList, getList, removeFromList, type ListMember, type SavedList } from "./savedLists";

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

export { unsaveIfUnlisted } from "./unlisted";

/**
 * Adds first and removes last, so a move between lists never leaves the item on none
 * (which would unsave it and lose its notes). `save` runs whenever the member ends up on a list.
 */
export async function applyListChanges(
  member: Member,
  changes: { add: string[]; remove: string[] },
  save: () => Promise<unknown>,
  onSyncIssue?: (message: string) => void,
): Promise<void> {
  const report = (message: string) => onSyncIssue?.(message);
  for (const id of changes.add) {
    await addToList(id, member);
    const list = await getList(id);
    const added = list?.members.find((m) => m.type === member.type && m.id === member.id);
    if (!list || !added) continue;
    try {
      if ((await pushAdd(list, added)) === "missing") report("Saved here, but Hardcover doesn't have this book yet.");
    } catch {
      report("Saved here. Hardcover didn't update; use Sync with Hardcover on the list to retry.");
    }
    try {
      if ((await pushOpenLibraryAdd(list, added)) === "missing") report("Saved here, but Open Library doesn't have this edition.");
    } catch {
      report("Saved here. Open Library didn't update; use Sync with Open Library on the list to retry.");
    }
  }
  for (const id of changes.remove) {
    // Read before removing: the push needs the member's hardcoverBookId.
    const list = await getList(id);
    const held = list?.members.find((m) => m.type === member.type && m.id === member.id);
    await removeFromList(id, member.type, member.id);
    if (!list || !held) continue;
    try {
      await pushRemove(list, held);
    } catch {
      report("Removed here. Hardcover didn't update, so it may come back on the next sync.");
    }
    try {
      await pushOpenLibraryRemove(list, held);
    } catch {
      report("Removed here. Open Library didn't update, so it may come back on the next sync.");
    }
  }
  // Saving is idempotent, so also run it for a member already listed but unsaved.
  if (!(await unsaveIfUnlisted(member))) await save();
}

/** Deletes the list, then unsaves each of its members that no other list holds. */
export async function deleteListAndUnsave(listId: string): Promise<void> {
  const members = (await getList(listId))?.members ?? [];
  await deleteList(listId);
  for (const m of members) await unsaveIfUnlisted(m);
}
