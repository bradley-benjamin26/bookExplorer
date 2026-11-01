import type { HardcoverListBooks } from "@book-explorer/shared";
import type { ListMember } from "./savedLists";

/** What a pull leaves on a linked list: unpushed locals stay, locals removed on Hardcover go, Hardcover-only books are appended. */
export function reconcile(local: ListMember[], remote: HardcoverListBooks["books"], now: number): ListMember[] {
  const remoteIds = new Set(remote.map((b) => b.hardcoverBookId));
  const kept = local.filter((m) => m.hardcoverBookId === undefined || remoteIds.has(m.hardcoverBookId));
  const known = new Set(kept.map((m) => m.hardcoverBookId));
  // An unlinked local book with the same ISBN stays as-is; the push half of sync links it.
  const isbns = new Set(kept.filter((m) => m.type === "book" && m.hardcoverBookId === undefined).map((m) => m.id));
  const added = remote
    .filter((b) => b.isbn && !known.has(b.hardcoverBookId) && !isbns.has(b.isbn))
    .map((b): ListMember => ({ type: "book", id: b.isbn!, title: b.title, hardcoverBookId: b.hardcoverBookId, addedAt: now }));
  return [...kept, ...added];
}
