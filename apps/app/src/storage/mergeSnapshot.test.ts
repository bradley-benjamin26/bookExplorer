import { describe, expect, it } from "vitest";
import type { Library } from "./librarySettings";
import { mergeSnapshots } from "./mergeSnapshot";
import type { SavedBookRecord } from "./savedBooks";
import type { SavedItem } from "./savedItems";
import type { SavedWorkRecord } from "./savedWorks";
import type { Snapshot } from "./snapshot";

const item = (id: string, updatedAt: number, extra: Partial<SavedItem> = {}): SavedItem => ({
  schemaVersion: 1,
  updatedAt,
  type: "book",
  id,
  title: `T${id}`,
  ...extra,
});

const book = (isbn: string, updatedAt: number, extra: Partial<SavedBookRecord> = {}): SavedBookRecord => ({
  schemaVersion: 1,
  updatedAt,
  isbn,
  wikidataId: null,
  openLibraryEditionId: null,
  openLibraryWorkId: null,
  title: "B",
  authorNames: [],
  format: null,
  subjects: [],
  genres: [],
  notes: "",
  savedAt: 1,
  ...extra,
});

const work = (id: string, updatedAt: number, extra: Partial<SavedWorkRecord> = {}): SavedWorkRecord => ({
  schemaVersion: 2,
  updatedAt,
  openLibraryWorkId: id,
  title: "W",
  authorNames: [],
  subjects: [],
  genres: [],
  notes: "",
  savedAt: 1,
  ...extra,
});

const library = (id: string, updatedAt: number, name = id): Library => ({ schemaVersion: 1, updatedAt, id, name, isbnUrl: "", titleUrl: "" });

const snap = (parts: Partial<Snapshot>): Snapshot => ({ schemaVersion: 1, items: [], books: [], works: [], libraries: [], ...parts });

describe("mergeSnapshots", () => {
  it("unions records only one side has, newest first", () => {
    const merged = mergeSnapshots(snap({ items: [item("1", 10)] }), snap({ items: [item("2", 20)] }));
    expect(merged.items.map((i) => i.id)).toEqual(["2", "1"]);
  });

  it("keeps the newer updatedAt on a conflict, whichever side it's on", () => {
    const a = snap({ books: [book("1", 10, { notes: "old" })] });
    const b = snap({ books: [book("1", 20, { notes: "new" })] });
    expect(mergeSnapshots(a, b).books[0].notes).toBe("new");
    expect(mergeSnapshots(b, a).books[0].notes).toBe("new");
  });

  it("lets a tombstone beat an older edit, and a newer re-save beat a tombstone", () => {
    const removed = item("1", 20, { deletedAt: 20 });
    expect(mergeSnapshots(snap({ items: [item("1", 10)] }), snap({ items: [removed] })).items[0].deletedAt).toBe(20);
    expect(mergeSnapshots(snap({ items: [item("1", 30)] }), snap({ items: [removed] })).items[0].deletedAt).toBeUndefined();
  });

  it("breaks an updatedAt tie the same way in either order, tombstone first", () => {
    const live = item("1", 10);
    const removed = item("1", 10, { deletedAt: 10 });
    expect(mergeSnapshots(snap({ items: [live] }), snap({ items: [removed] }))).toEqual(
      mergeSnapshots(snap({ items: [removed] }), snap({ items: [live] }))
    );
    expect(mergeSnapshots(snap({ items: [live] }), snap({ items: [removed] })).items[0].deletedAt).toBe(10);
    const x = item("1", 10, { title: "X" });
    const y = item("1", 10, { title: "Y" });
    expect(mergeSnapshots(snap({ items: [x] }), snap({ items: [y] }))).toEqual(mergeSnapshots(snap({ items: [y] }), snap({ items: [x] })));
  });

  it("unions a live book's tags, taking the other fields from the newer copy", () => {
    const a = snap({ books: [book("1", 10, { subjects: ["a", "b"], genres: ["g"], notes: "old" })] });
    const b = snap({ books: [book("1", 20, { subjects: ["b", "c"], genres: [], notes: "new" })] });
    expect(mergeSnapshots(a, b).books[0]).toMatchObject({ subjects: ["b", "c", "a"], genres: ["g"], notes: "new" });
  });

  it("doesn't carry tags from or into a tombstoned copy", () => {
    const removed = book("1", 20, { deletedAt: 20, subjects: ["old"] });
    expect(mergeSnapshots(snap({ books: [book("1", 10, { subjects: ["x"] })] }), snap({ books: [removed] })).books[0]).toEqual(removed);
    const resaved = book("1", 30, { subjects: ["new"] });
    expect(mergeSnapshots(snap({ books: [resaved] }), snap({ books: [removed] })).books[0]).toEqual(resaved);
  });

  it("keys items by type and id, so a book and a work with the same id both survive", () => {
    const merged = mergeSnapshots(snap({ items: [item("1", 10)] }), snap({ items: [item("1", 10, { type: "work" })] }));
    expect(merged.items).toHaveLength(2);
  });

  it("revives the item when the book's record was edited after the removal", () => {
    // A removed the book at 20 (item + record); B edited the record's notes at 30.
    const a = snap({ items: [item("1", 20, { deletedAt: 20 })], books: [book("1", 20, { deletedAt: 20 })] });
    const b = snap({ items: [item("1", 5)], books: [book("1", 30, { notes: "edited" })] });
    for (const merged of [mergeSnapshots(a, b), mergeSnapshots(b, a)]) {
      expect(merged.items[0]).toEqual(item("1", 30));
      expect(merged.books[0]).toMatchObject({ notes: "edited", updatedAt: 30 });
      expect(merged.books[0].deletedAt).toBeUndefined();
    }
  });

  it("removes the record when the item was removed after the record's last edit", () => {
    const a = snap({ items: [item("1", 40, { deletedAt: 40 })] });
    const b = snap({ items: [item("1", 5)], books: [book("1", 30, { notes: "private", subjects: ["s"] })] });
    for (const merged of [mergeSnapshots(a, b), mergeSnapshots(b, a)]) {
      expect(merged.items[0].deletedAt).toBe(40);
      expect(merged.books[0]).toMatchObject({ updatedAt: 40, deletedAt: 40, notes: "", subjects: [], genres: [] });
    }
    // Equal timestamps: the removal wins.
    const tie = mergeSnapshots(snap({ items: [item("1", 30, { deletedAt: 30 })] }), b);
    expect(tie.books[0].deletedAt).toBe(30);
  });

  it("leaves a work item alone even if a book record shares its id", () => {
    const merged = mergeSnapshots(snap({ items: [item("1", 40, { type: "work", deletedAt: 40 })] }), snap({ books: [book("1", 30)] }));
    expect(merged.books[0].deletedAt).toBeUndefined();
  });

  it("merges work conflicts like books: newer wins, live tags union, a tombstone wins a tie", () => {
    const a = snap({ works: [work("OL1W", 10, { subjects: ["a"], notes: "old" })] });
    const b = snap({ works: [work("OL1W", 20, { subjects: ["b"], notes: "new" })] });
    expect(mergeSnapshots(a, b).works).toEqual([work("OL1W", 20, { subjects: ["b", "a"], notes: "new" })]);
    expect(mergeSnapshots(b, a).works).toEqual(mergeSnapshots(a, b).works);
    const removed = work("OL1W", 20, { deletedAt: 20 });
    expect(mergeSnapshots(b, snap({ works: [removed] })).works[0]).toEqual(removed);
    expect(mergeSnapshots(snap({ works: [removed] }), b).works[0]).toEqual(removed);
  });

  it("reconciles a work's item and record, whichever changed last", () => {
    const workItem = (updatedAt: number, extra: Partial<SavedItem> = {}) => item("OL1W", updatedAt, { type: "work", ...extra });
    // Record edited after the removal: both live.
    const revived = mergeSnapshots(
      snap({ items: [workItem(20, { deletedAt: 20 })], works: [work("OL1W", 20, { deletedAt: 20 })] }),
      snap({ items: [workItem(5)], works: [work("OL1W", 30, { notes: "edited" })] })
    );
    expect(revived.items[0]).toEqual(workItem(30));
    expect(revived.works[0]).toEqual(work("OL1W", 30, { notes: "edited" }));
    // Item removed after the record's last edit: record tombstoned and blanked.
    const removed = mergeSnapshots(
      snap({ items: [workItem(40, { deletedAt: 40 })] }),
      snap({ items: [workItem(5)], works: [work("OL1W", 30, { notes: "private", genres: ["g"] })] })
    );
    expect(removed.works[0]).toMatchObject({ updatedAt: 40, deletedAt: 40, notes: "", subjects: [], genres: [] });
    // A book item with the same id doesn't touch the work record.
    const other = mergeSnapshots(snap({ items: [item("OL1W", 40, { deletedAt: 40 })] }), snap({ works: [work("OL1W", 30)] }));
    expect(other.works[0].deletedAt).toBeUndefined();
  });

  it("brings back a library one side removed, since libraries have no tombstone", () => {
    const merged = mergeSnapshots(snap({ libraries: [library("a", 10, "A1")] }), snap({ libraries: [library("a", 20, "A2"), library("b", 5)] }));
    expect(merged.libraries.map((l) => l.name)).toEqual(["A2", "b"]);
    expect(mergeSnapshots(snap({}), snap({ libraries: [library("gone", 1)] })).libraries).toHaveLength(1);
  });
});
