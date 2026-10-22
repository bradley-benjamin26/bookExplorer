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

function mergeBy<T extends Versioned>(a: T[], b: T[], key: (r: T) => string, pick: (x: T, y: T) => T): T[] {
  const merged = new Map<string, T>();
  for (const r of [...a, ...b]) {
    const k = key(r);
    const existing = merged.get(k);
    merged.set(k, existing ? pick(existing, r) : r);
  }
  // Newest first (the order the Saved screen lists items in), key as tiebreak for a stable result.
  return [...merged.values()].sort((x, y) => y.updatedAt - x.updatedAt || (key(x) < key(y) ? -1 : 1));
}

/**
 * Union of two snapshots, record by record: newer updatedAt wins, tombstones
 * beat older edits, and a book's tags (subjects/genres) are unioned when both
 * copies are live. Pure, so a future cross-device sync can reuse it.
 *
 * Libraries have no tombstone (removeLibrary hard-deletes), so a library
 * removed on one side and still present on the other comes back. Accepted:
 * they're a few hand-entered settings cards, and resurrecting one is cheaper
 * than silently losing one the user still wanted.
 */
export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  return {
    schemaVersion: Math.max(a.schemaVersion, b.schemaVersion),
    items: mergeBy<SavedItem>(a.items, b.items, (i) => `${i.type}:${i.id}`, newer),
    books: mergeBy<SavedBookRecord>(a.books, b.books, (r) => r.isbn, mergeBook),
    libraries: mergeBy<Library>(a.libraries, b.libraries, (l) => l.id, newer),
  };
}
