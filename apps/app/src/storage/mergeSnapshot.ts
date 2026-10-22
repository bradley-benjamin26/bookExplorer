import type { Library } from "./librarySettings";
import type { SavedBookRecord } from "./savedBooks";
import type { SavedItem } from "./savedItems";
import type { Versioned } from "./schema";
import type { Snapshot } from "./snapshot";

type Mergeable = Versioned & { deletedAt?: number };

/**
 * Which of two copies of one record survives: the newer updatedAt; on a tie a
 * tombstone (so a removal isn't undone by an edit made the same ms), then the
 * larger JSON — arbitrary but order-independent, so merge(a, b) equals merge(b, a).
 */
function newer<T extends Mergeable>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (!!a.deletedAt !== !!b.deletedAt) return a.deletedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

function mergeBook(a: SavedBookRecord, b: SavedBookRecord): SavedBookRecord {
  const winner = newer(a, b);
  if (winner.deletedAt || a.deletedAt || b.deletedAt) return winner;
  // Tags are a set union: one side adding a tag shouldn't drop the other side's.
  const [first, second] = winner === a ? [a, b] : [b, a];
  return { ...winner, subjects: union(first.subjects, second.subjects), genres: union(first.genres, second.genres) };
}

function mergeBy<T extends Versioned>(a: T[], b: T[], key: (r: T) => string, pick: (x: T, y: T) => T): Map<string, T> {
  const merged = new Map<string, T>();
  for (const r of [...a, ...b]) {
    const k = key(r);
    const existing = merged.get(k);
    merged.set(k, existing ? pick(existing, r) : r);
  }
  return merged;
}

// Newest first (the order the Saved screen lists items in), key as tiebreak for a stable result.
const sorted = <T extends Versioned>(merged: Map<string, T>) =>
  [...merged.entries()].sort(([kx, x], [ky, y]) => y.updatedAt - x.updatedAt || (kx < ky ? -1 : 1)).map(([, r]) => r);

/** `r` made live or removed to match `lead`, as of lead's updatedAt. */
function follow<T extends Mergeable>(r: T, lead: Mergeable): T {
  if (lead.deletedAt) return { ...r, updatedAt: lead.updatedAt, deletedAt: lead.deletedAt };
  const { deletedAt: _, ...live } = r;
  return { ...live, updatedAt: lead.updatedAt } as T;
}

/**
 * A book's saved item and its record merge separately, so removing a book on
 * one side and editing its notes on the other could leave one live and one
 * removed. Whichever changed last decides for both (a tombstone on a tie).
 */
function reconcile(items: Map<string, SavedItem>, books: Map<string, SavedBookRecord>) {
  for (const [isbn, record] of books) {
    const item = items.get(`book:${isbn}`);
    if (!item || !item.deletedAt === !record.deletedAt) continue;
    const lead = newer<Mergeable>(item, record);
    items.set(`book:${isbn}`, follow(item, lead));
    const followed = follow(record, lead);
    // A tombstone drops notes and tags, as removeSavedBook's does.
    books.set(isbn, followed.deletedAt ? { ...followed, subjects: [], genres: [], notes: "" } : followed);
  }
}

/**
 * Union of two snapshots, record by record: newer updatedAt wins, tombstones
 * beat older edits, and a book's tags (subjects/genres) are unioned when both
 * copies are live, then a book's item and record are made to agree on whether
 * it's saved. Pure, so a future cross-device sync can reuse it.
 *
 * Libraries have no tombstone (removeLibrary hard-deletes), so a library
 * removed on one side and still present on the other comes back. Accepted:
 * they're a few hand-entered settings cards, and resurrecting one is cheaper
 * than silently losing one the user still wanted.
 */
export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const items = mergeBy<SavedItem>(a.items, b.items, (i) => `${i.type}:${i.id}`, newer);
  const books = mergeBy<SavedBookRecord>(a.books, b.books, (r) => r.isbn, mergeBook);
  reconcile(items, books);
  return {
    schemaVersion: Math.max(a.schemaVersion, b.schemaVersion),
    items: sorted(items),
    books: sorted(books),
    libraries: sorted(mergeBy<Library>(a.libraries, b.libraries, (l) => l.id, newer)),
  };
}
