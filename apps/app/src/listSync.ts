import { ApiError } from "./api/client";
import { getSavedBook, saveListedBook } from "./storage/savedBooks";
import { ensureSaved } from "./storage/savedItems";
import { getSavedWork, saveListedWork } from "./storage/savedWorks";
import { ensureOnAList, getList, isOnAnyList, replaceMembers, settleRemovals, type ListMember, type SavedList } from "./storage/savedLists";
import { unsaveIfUnlisted } from "./storage/unlisted";

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MAX_RATE_LIMIT_RETRIES = 5;

/** Runs `run`, waiting out each 429's Retry-After and trying again, up to MAX_RATE_LIMIT_RETRIES times. */
export async function retryRateLimited<T>(run: () => Promise<T>, sleep: (ms: number) => Promise<void>, onWait: (seconds: number) => void): Promise<T> {
  for (let tries = 0; ; tries++) {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 429) || tries >= MAX_RATE_LIMIT_RETRIES) throw e;
      const seconds = e.retryAfterSeconds ?? 60;
      onWait(seconds);
      await sleep(seconds * 1000);
    }
  }
}

/** Saves a member pulled from a remote list, since every listed member must be a saved item (see withListedSaves). Idempotent. */
export function saveListed(m: Pick<ListMember, "type" | "id" | "title">): Promise<void> {
  if (m.type === "book") return saveListedBook(m.id, m.title);
  if (m.type === "work") return saveListedWork(m.id, m.title);
  return ensureSaved({ type: "author", id: m.id, title: m.title });
}

/** Stores a pulled member set, then saves new members and unsaves members that left (keeping any with notes on a list). */
export async function applyPulledMembers(latest: SavedList, next: ListMember[]): Promise<void> {
  await replaceMembers(latest.id, next);
  const key = (m: Pick<ListMember, "type" | "id">) => `${m.type}:${m.id}`;
  const after = new Set(next.map(key));
  for (const m of next) await saveListed(m); // idempotent; repairs members that never got saved
  for (const m of latest.members) {
    if (after.has(key(m))) continue;
    // The remote service dropping a member must not silently delete the user's notes.
    const saved = m.type === "book" ? await getSavedBook(m.id) : m.type === "work" ? await getSavedWork(m.id) : null;
    if (saved?.notes && !(await isOnAnyList(m.type, m.id))) await ensureOnAList({ type: m.type, id: m.id, title: m.title });
    else await unsaveIfUnlisted(m);
  }
}

/** What differs between the linked-list services; syncLinkedList does the rest. */
export interface LinkedListService<Item, Id extends string | number> {
  name: "Hardcover" | "Open Library"; // used in both error strings
  settle: "hardcover" | "openLibrary"; // settleRemovals' service argument
  remoteListId: (list: SavedList) => string | number | undefined;
  memberRemoteId: (m: { hardcoverBookId?: number; openLibrarySeed?: string }) => Id | undefined;
  push: (list: SavedList) => Promise<{ missing: string[] }>;
  fetch: (remoteListId: string | number) => Promise<{ items: Item[]; total: number }>;
  itemId: (item: Item) => Id;
  remove: (remoteListId: string | number, id: Id) => Promise<void>;
  reconcile: (members: ListMember[], items: Item[], list: SavedList) => ListMember[];
  skipped: (items: Item[], next: ListMember[]) => string[];
}

/** Pushes local changes, finishes pending remote deletes, then reconciles the local list against the remote one. */
export async function syncLinkedList<Item, Id extends string | number>(list: SavedList, s: LinkedListService<Item, Id>): Promise<{ missing: string[]; skipped: string[] }> {
  const remoteListId = s.remoteListId(list);
  if (!remoteListId) throw new Error(`This list isn't linked to ${s.name}.`);
  const { missing } = await s.push(list);
  const latest = await getList(list.id); // re-read so ids just set by the push are included
  if (!latest) throw new Error("This list no longer exists.");
  // Members removed here whose remote delete never happened; unless the user re-added them, finish the delete rather than reconciling them back.
  const live = (r: { type: string; id: string; hardcoverBookId?: number; openLibrarySeed?: string }) => {
    const rid = s.memberRemoteId(r);
    return latest.members.some((m) => (rid !== undefined && s.memberRemoteId(m) === rid) || (m.type === r.type && m.id === r.id));
  };
  const pending = new Set<Id>();
  for (const r of latest.removedMembers ?? []) {
    const rid = s.memberRemoteId(r);
    if (rid && !live(r)) pending.add(rid);
  }
  const remote = await s.fetch(remoteListId);
  // Reconcile drops members missing remotely, so a short read would delete real members.
  if (remote.items.length < remote.total) throw new Error(`${s.name} sent only part of this list, so nothing was removed. Try again later.`);
  for (const id of new Set(remote.items.map(s.itemId))) if (pending.has(id)) await s.remove(remoteListId, id);
  const kept = remote.items.filter((i) => !pending.has(s.itemId(i)));
  const next = s.reconcile(latest.members, kept, latest);
  await applyPulledMembers(latest, next);
  await settleRemovals(list.id, s.settle);
  return { missing, skipped: s.skipped(kept, next) };
}
