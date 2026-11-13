import type { HardcoverListBooks } from "@book-explorer/shared";
import { ApiError, addHardcoverListBook, createHardcoverList, fetchHardcoverList, removeHardcoverListBook } from "./api/client";
import { reconcile } from "./storage/hardcoverReconcile";
import { retryRateLimited, syncLinkedList, wait } from "./listSync";
import { saveListedBook } from "./storage/savedBooks";
import { createList, linkList, replaceMembers, setMemberHardcoverId, type ListMember, type SavedList } from "./storage/savedLists";

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
  // Hardcover deletes by book, so a work and its edition share a row; keep it while the other is still listed.
  if (list.members.some((m) => m.hardcoverBookId === member.hardcoverBookId && !(m.type === member.type && m.id === member.id))) return;
  await removeHardcoverListBook(list.hardcoverListId, member.hardcoverBookId);
}

export async function importList(hardcoverListId: number): Promise<{ list: SavedList; skipped: string[] }> {
  const remote = await fetchHardcoverList(hardcoverListId);
  const list = await createList({ name: remote.name.trim().slice(0, 100) || "Hardcover list", description: remote.description.trim().slice(0, 1000), kind: "book", hardcoverListId });
  const members = reconcile([], remote.books, Date.now());
  await replaceMembers(list.id, members);
  for (const m of members) if (m.type === "book") await saveListedBook(m.id, m.title);
  return { list, skipped: remote.books.filter((b) => !b.isbn).map((b) => b.title) };
}

/** Imports one at a time; the first failure rethrows and lists already imported stay. */
export async function importChosenLists(hardcoverListIds: number[]): Promise<string[]> {
  const ids: string[] = [];
  for (const id of hardcoverListIds) ids.push((await importList(id)).list.id);
  return ids;
}

export async function copyToHardcover(
  list: SavedList,
  onProgress: (done: number, total: number) => void,
  sleep: (ms: number) => Promise<void> = wait,
  onWait: (seconds: number) => void = () => {},
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
    if ((await retryRateLimited(() => pushAdd(linked, m), sleep, onWait)) === "missing") missing.push(m.title);
    onProgress(++done, todo.length);
  }
  return { missing, skippedAuthors: list.members.length - books.length };
}

export const syncWithHardcover = (list: SavedList) =>
  syncLinkedList<HardcoverListBooks["books"][number], number>(list, {
    name: "Hardcover",
    settle: "hardcover",
    remoteListId: (l) => l.hardcoverListId,
    memberRemoteId: (m) => m.hardcoverBookId,
    push: (l) => copyToHardcover(l, () => {}),
    fetch: async (id) => {
      const r = await fetchHardcoverList(id as number);
      return { items: r.books, total: r.booksCount };
    },
    itemId: (b) => b.hardcoverBookId,
    remove: (id, bookId) => removeHardcoverListBook(id as number, bookId),
    reconcile: (members, books) => reconcile(members, books, Date.now()),
    skipped: (books) => books.filter((b) => !b.isbn).map((b) => b.title),
  });
