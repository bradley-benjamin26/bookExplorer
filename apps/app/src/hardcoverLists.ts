import { ApiError, addHardcoverListBook, createHardcoverList, fetchHardcoverList, removeHardcoverListBook } from "./api/client";
import { reconcile } from "./storage/hardcoverReconcile";
import { createList, getList, linkList, replaceMembers, setMemberHardcoverId, type ListMember, type SavedList } from "./storage/savedLists";

export async function pushAdd(list: SavedList, member: ListMember): Promise<"pushed" | "missing" | "skipped"> {
  if (!list.hardcoverListId || member.type === "author") return "skipped";
  try {
    const { hardcoverBookId } = await addHardcoverListBook(list.hardcoverListId, { type: member.type, id: member.id });
    await setMemberHardcoverId(list.id, member.type, member.id, hardcoverBookId);
    return "pushed";
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return "missing";
    throw e;
  }
}

export async function pushRemove(list: SavedList, member: ListMember): Promise<void> {
  if (!list.hardcoverListId || !member.hardcoverBookId) return;
  await removeHardcoverListBook(list.hardcoverListId, member.hardcoverBookId);
}

export async function importList(hardcoverListId: number): Promise<{ list: SavedList; skipped: string[] }> {
  const remote = await fetchHardcoverList(hardcoverListId);
  const list = await createList({ name: remote.name, description: remote.description, kind: "book", hardcoverListId });
  await replaceMembers(list.id, reconcile([], remote.books, Date.now()));
  return { list, skipped: remote.books.filter((b) => !b.isbn).map((b) => b.title) };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function copyToHardcover(
  list: SavedList,
  onProgress: (done: number, total: number) => void,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<{ missing: string[]; skippedAuthors: number }> {
  let linked = list;
  if (list.hardcoverListId === undefined) {
    // Members keep stale ids after an Unlink; strip them so an interrupted copy resumes by pushing exactly the unpushed ones (a stale id would look pushed and reconcile would then delete the member).
    const members = list.members.map(({ hardcoverBookId: _stale, ...m }) => m);
    await replaceMembers(list.id, members);
    const { id } = await createHardcoverList({ name: list.name, description: list.description ?? "" });
    await linkList(list.id, id);
    linked = { ...list, members, hardcoverListId: id };
  }
  const books = linked.members.filter((m) => m.type !== "author");
  const todo = books.filter((m) => m.hardcoverBookId === undefined);
  const missing: string[] = [];
  let done = 0;
  for (const m of todo) {
    for (;;) {
      try {
        if ((await pushAdd(linked, m)) === "missing") missing.push(m.title);
        break;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 429)) throw e;
        await sleep((e.retryAfterSeconds ?? 60) * 1000);
      }
    }
    onProgress(++done, todo.length);
  }
  return { missing, skippedAuthors: list.members.length - books.length };
}

export async function syncWithHardcover(list: SavedList): Promise<{ missing: string[]; skipped: string[] }> {
  if (!list.hardcoverListId) throw new Error("This list isn't linked to Hardcover.");
  const { missing } = await copyToHardcover(list, () => {});
  const remote = await fetchHardcoverList(list.hardcoverListId);
  const latest = await getList(list.id); // re-read so ids just set by the push are included
  if (!latest) throw new Error("This list no longer exists.");
  await replaceMembers(list.id, reconcile(latest.members, remote.books, Date.now()));
  return { missing, skipped: remote.books.filter((b) => !b.isbn).map((b) => b.title) };
}
