import { unsaveBook } from "./savedBooks";
import { removeSaved } from "./savedItems";
import { isOnAnyList, type ListMember } from "./savedLists";
import { unsaveWork } from "./savedWorks";

/** Unsaves `member` (dropping its notes) when no live list holds it; returns whether it did. */
export async function unsaveIfUnlisted(member: Pick<ListMember, "type" | "id">): Promise<boolean> {
  if (await isOnAnyList(member.type, member.id)) return false;
  if (member.type === "book") await unsaveBook(member.id);
  else if (member.type === "work") await unsaveWork(member.id);
  else await removeSaved("author", member.id);
  return true;
}
