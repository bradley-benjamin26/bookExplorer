import { ApiError, addHardcoverListBook, createHardcoverList, fetchHardcoverList, removeHardcoverListBook } from "./api/client";
import { reconcile } from "./storage/hardcoverReconcile";
import { getSavedBook, saveListedBook } from "./storage/savedBooks";
import { getSavedWork } from "./storage/savedWorks";
import { createList, ensureOnAList, getList, isOnAnyList, linkList, replaceMembers, setMemberHardcoverId, settleRemovals, type ListMember, type SavedList } from "./storage/savedLists";
import { unsaveIfUnlisted } from "./storage/unlisted";

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
  const list = await createList({ name: remote.name, description: remote.description, kind: "book", hardcoverListId });
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

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MAX_RATE_LIMIT_RETRIES = 5;

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
    for (let tries = 0; ; tries++) {
      try {
        if ((await pushAdd(linked, m)) === "missing") missing.push(m.title);
        break;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 429) || tries >= MAX_RATE_LIMIT_RETRIES) throw e;
        const seconds = e.retryAfterSeconds ?? 60;
        onWait(seconds);
        await sleep(seconds * 1000);
      }
    }
    onProgress(++done, todo.length);
  }
  return { missing, skippedAuthors: list.members.length - books.length };
}

export async function syncWithHardcover(list: SavedList): Promise<{ missing: string[]; skipped: string[] }> {
  if (!list.hardcoverListId) throw new Error("This list isn't linked to Hardcover.");
  const { missing } = await copyToHardcover(list, () => {});
  const latest = await getList(list.id); // re-read so ids just set by the push are included
  if (!latest) throw new Error("This list no longer exists.");
  // Books removed here whose Hardcover delete never happened; unless the user re-added them, finish the delete rather than reconciling them back.
  const live = (r: { type: string; id: string; hardcoverBookId?: number }) =>
    latest.members.some((m) => (r.hardcoverBookId && m.hardcoverBookId === r.hardcoverBookId) || (m.type === r.type && m.id === r.id));
  const pending = new Set((latest.removedMembers ?? []).filter((r) => r.hardcoverBookId && !live(r)).map((r) => r.hardcoverBookId));
  const remote = await fetchHardcoverList(list.hardcoverListId);
  // Reconcile drops members missing remotely, so a short page would delete real members.
  if (remote.books.length < remote.booksCount) throw new Error("Hardcover sent only part of this list, so nothing was removed. Try again later.");
  for (const b of remote.books) if (pending.has(b.hardcoverBookId)) await removeHardcoverListBook(list.hardcoverListId, b.hardcoverBookId);
  const next = reconcile(latest.members, remote.books.filter((b) => !pending.has(b.hardcoverBookId)), Date.now());
  await replaceMembers(list.id, next);
  await settleRemovals(list.id);
  const key = (m: Pick<ListMember, "type" | "id">) => `${m.type}:${m.id}`;
  const after = new Set(next.map(key));
  for (const m of next) if (m.type === "book") await saveListedBook(m.id, m.title); // idempotent; repairs books that never got saved
  for (const m of latest.members) {
    if (after.has(key(m))) continue;
    // Hardcover dropping a member must not silently delete the user's notes.
    const saved = m.type === "book" ? await getSavedBook(m.id) : m.type === "work" ? await getSavedWork(m.id) : null;
    if (saved?.notes && !(await isOnAnyList(m.type, m.id))) await ensureOnAList({ type: m.type, id: m.id, title: m.title });
    else await unsaveIfUnlisted(m);
  }
  return { missing, skipped: remote.books.filter((b) => !b.isbn).map((b) => b.title) };
}
