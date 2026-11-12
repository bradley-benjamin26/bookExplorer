import { addOpenLibraryMembers, removeOpenLibrarySeed } from "./api/client";
import { setMemberOpenLibrarySeed, type ListMember, type SavedList } from "./storage/savedLists";

export async function pushOpenLibraryAdd(list: SavedList, member: ListMember): Promise<"pushed" | "missing" | "skipped"> {
  if (!list.openLibraryListId) return "skipped";
  const { added } = await addOpenLibraryMembers(list.openLibraryListId, [{ type: member.type, id: member.id }]);
  const hit = added.find((a) => a.type === member.type && a.id === member.id);
  if (!hit) return "missing";
  await setMemberOpenLibrarySeed(list.id, member.type, member.id, hit.seed);
  return "pushed";
}

export async function pushOpenLibraryRemove(list: SavedList, member: ListMember): Promise<void> {
  if (!list.openLibraryListId || !member.openLibrarySeed) return;
  // A work and its edition can share a seed; keep it while the other is still listed.
  if (list.members.some((m) => m.openLibrarySeed === member.openLibrarySeed && !(m.type === member.type && m.id === member.id))) return;
  await removeOpenLibrarySeed(list.openLibraryListId, member.openLibrarySeed);
}
