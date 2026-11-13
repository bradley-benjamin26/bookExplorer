import type { OpenLibraryList } from "@book-explorer/shared";
import { addOpenLibraryMembers, createOpenLibraryList, fetchOpenLibraryList, removeOpenLibrarySeed } from "./api/client";
import { retryRateLimited, saveListed, syncLinkedList, wait } from "./listSync";
import { reconcileOpenLibrary } from "./storage/openLibraryReconcile";
import { createList, linkOpenLibraryList, replaceMembers, setMemberOpenLibrarySeed, type ListMember, type SavedList } from "./storage/savedLists";

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

const BATCH = 50;

/** Titles of remote seeds that have no matching member: subjects, ISBN-less editions, the wrong kind. */
const unlanded = (seeds: OpenLibraryList["seeds"], members: ListMember[]) =>
  seeds
    .filter((s) => !members.some((m) => m.openLibrarySeed === s.seed || (s.member && m.type === s.member.type && m.id === s.member.id)))
    .map((s) => s.title);

export async function importOpenLibraryList(openLibraryListId: string): Promise<{ list: SavedList; skipped: string[] }> {
  const remote = await fetchOpenLibraryList(openLibraryListId);
  const found = remote.seeds.flatMap((s) => (s.member ? [s.member] : []));
  // An empty list would vacuously be "all authors"; books are the usual case.
  const kind = found.length > 0 && found.every((m) => m.type === "author") ? "author" : "book";
  const list = await createList({ name: remote.name.trim().slice(0, 100) || "Open Library list", description: remote.description.trim().slice(0, 1000), kind, openLibraryListId });
  const members = reconcileOpenLibrary([], remote.seeds, kind, Date.now());
  await replaceMembers(list.id, members);
  for (const m of members) await saveListed(m);
  return { list, skipped: unlanded(remote.seeds, members) };
}

export async function copyToOpenLibrary(
  list: SavedList,
  onProgress: (done: number, total: number) => void,
  sleep: (ms: number) => Promise<void> = wait,
  onWait: (seconds: number) => void = () => {},
): Promise<{ missing: string[] }> {
  let linked = list;
  if (!list.openLibraryListId) {
    // Members keep stale seeds after an Unlink; strip them so an interrupted copy resumes by pushing exactly the unpushed ones.
    const members = list.members.map(({ openLibrarySeed: _stale, ...m }) => m);
    await replaceMembers(list.id, members);
    const { id } = await createOpenLibraryList({ name: list.name, description: list.description ?? "" });
    await linkOpenLibraryList(list.id, id);
    linked = { ...list, members, openLibraryListId: id };
  }
  const listId = linked.openLibraryListId!;
  // Seedless members include ones Open Library already has; re-adding a seed is harmless and gives us the seed.
  const todo = linked.members.filter((m) => !m.openLibrarySeed);
  const missing: string[] = [];
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const { added } = await retryRateLimited(() => addOpenLibraryMembers(listId, batch.map((m) => ({ type: m.type, id: m.id }))), sleep, onWait);
    for (const a of added) await setMemberOpenLibrarySeed(list.id, a.type, a.id, a.seed);
    for (const m of batch) if (!added.some((a) => a.type === m.type && a.id === m.id)) missing.push(m.title);
    onProgress(i + batch.length, todo.length);
  }
  return { missing };
}

export const syncWithOpenLibrary = (list: SavedList) =>
  syncLinkedList<OpenLibraryList["seeds"][number], string>(list, {
    name: "Open Library",
    settle: "openLibrary",
    remoteListId: (l) => l.openLibraryListId,
    memberRemoteId: (m) => m.openLibrarySeed,
    push: (l) => copyToOpenLibrary(l, () => {}),
    fetch: async (id) => {
      const r = await fetchOpenLibraryList(id as string);
      return { items: r.seeds, total: r.seedCount };
    },
    itemId: (s) => s.seed,
    remove: (id, seed) => removeOpenLibrarySeed(id as string, seed),
    reconcile: (members, seeds, l) => reconcileOpenLibrary(members, seeds, l.kind, Date.now()),
    skipped: unlanded,
  });
