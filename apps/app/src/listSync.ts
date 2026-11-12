import { ApiError } from "./api/client";
import { getSavedBook, saveListedBook } from "./storage/savedBooks";
import { ensureSaved } from "./storage/savedItems";
import { getSavedWork, saveListedWork } from "./storage/savedWorks";
import { ensureOnAList, isOnAnyList, replaceMembers, type ListMember, type SavedList } from "./storage/savedLists";
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
