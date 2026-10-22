import { MAX_IMPORT_BYTES, MAX_IMPORT_RECORDS, type Book } from "@book-explorer/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBookWithAlternate } from "./api/bookLookup";
import { exportJson, ImportError, importSnapshot, NEW_CSV_IMPORT, parseBookCsv, parseSnapshotJson, runCsvImport } from "./backup";
import AsyncStorage from "./test/asyncStorageMock";
import { upsertLibrary } from "./storage/librarySettings";
import { getSavedBook, updateSavedBook } from "./storage/savedBooks";
import { getSavedItems, toggleSaved } from "./storage/savedItems";
import { getSavedWork, updateSavedWork } from "./storage/savedWorks";
import { getSnapshot, migrateStorage } from "./storage/snapshot";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
vi.mock("./api/bookLookup", () => ({ fetchBookWithAlternate: vi.fn() }));

const fetchBook = vi.mocked(fetchBookWithAlternate);

const apiBook = (isbn: string, title: string) =>
  ({ isbn, title, wikidataId: null, openLibraryEditionId: null, openLibraryWorkId: null, authors: [], format: null, subjects: [], genres: [] }) as unknown as Book;

async function seed() {
  await toggleSaved({ type: "book", id: "9780441013593", title: "Dune" });
  fetchBook.mockResolvedValueOnce(apiBook("9780441013593", "Dune"));
  await runCsvImport([{ title: "Dune", isbn: "9780441013593" }], NEW_CSV_IMPORT, { onProgress: () => {}, isStopped: () => false, gapMs: 0 });
  await updateSavedBook("9780441013593", { notes: "spice" });
  await upsertLibrary({ id: "a", name: "A", isbnUrl: "https://lib.example/?q=", titleUrl: "" });
  await toggleSaved({ type: "work", id: "OL1W", title: "Emma" });
  await migrateStorage(); // gives OL1W its record
}

describe("JSON backup", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    fetchBook.mockReset();
  });

  it("round-trips: export, wipe, replace-import gives back the same snapshot", async () => {
    await seed();
    const before = await getSnapshot();
    const text = await exportJson();
    await AsyncStorage.clear();
    await toggleSaved({ type: "author", id: "OL1A", title: "Stale" });
    await importSnapshot(parseSnapshotJson(text), "replace");
    expect(await getSnapshot()).toEqual(before);
  });

  it("merge keeps local records the backup lacks and takes the backup's newer edits", async () => {
    await seed();
    const backup = parseSnapshotJson(await exportJson());
    backup.books[0] = { ...backup.books[0], notes: "from backup", updatedAt: backup.books[0].updatedAt + 1000 };
    await toggleSaved({ type: "author", id: "OL1A", title: "Local only" });
    await importSnapshot(backup, "merge");
    expect((await getSavedItems()).map((i) => i.id).sort()).toEqual(["9780441013593", "OL1A", "OL1W"]);
    expect((await getSavedBook("9780441013593"))?.notes).toBe("from backup");
  });

  it("rejects malformed JSON, non-backups, unsafe values and oversize files with an ImportError", async () => {
    await seed();
    const good = JSON.parse(await exportJson());
    const bad = (mutate: (s: typeof good) => void) => {
      const copy = structuredClone(good);
      mutate(copy);
      return JSON.stringify(copy);
    };
    const cases = [
      "{not json",
      JSON.stringify({ hello: "world" }),
      bad((s) => (s.libraries[0].isbnUrl = "javascript:alert(1)")),
      bad((s) => (s.books[0].isbn = "../../evil")),
      bad((s) => delete s.items[0].updatedAt),
      bad((s) => (s.items = Array(MAX_IMPORT_RECORDS + 1).fill(s.items[0]))),
      " ".repeat(MAX_IMPORT_BYTES + 1),
    ];
    for (const text of cases) expect(() => parseSnapshotJson(text), text.slice(0, 60)).toThrow(ImportError);
    expect(() => parseSnapshotJson(bad((s) => (s.schemaVersion = 99)))).toThrow(/newer version/);
  });

  it("exports v2 with works, and imports a v1 backup (no works) as having none", async () => {
    await seed();
    const v2 = JSON.parse(await exportJson());
    expect(v2.schemaVersion).toBe(2);
    expect(v2.works).toMatchObject([{ openLibraryWorkId: "OL1W", title: "Emma" }]);
    expect(parseSnapshotJson(JSON.stringify(v2)).works).toHaveLength(1);

    const { works: _, ...v1 } = { ...v2, schemaVersion: 1 };
    const parsed = parseSnapshotJson(JSON.stringify(v1));
    expect(parsed.works).toEqual([]);
    // Merging a v1 backup keeps the local work record, edits included.
    await updateSavedWork("OL1W", { notes: "local" });
    await importSnapshot({ ...parsed, items: parsed.items.map((i) => ({ ...i, updatedAt: Date.now() + 1000 })) }, "merge");
    expect((await getSavedWork("OL1W"))?.notes).toBe("local");
    // Replacing with it gives its saved works minimal records, as the storage migration does.
    await importSnapshot(parsed, "replace");
    expect(await getSavedWork("OL1W")).toMatchObject({ title: "Emma", subjects: [], notes: "" });
  });

  it("rejects a v2 backup without works, or with malformed works", async () => {
    await seed();
    const good = JSON.parse(await exportJson());
    const bad = (mutate: (s: typeof good) => void) => {
      const copy = structuredClone(good);
      mutate(copy);
      return JSON.stringify(copy);
    };
    const cases = [
      bad((s) => delete s.works),
      bad((s) => (s.works = "nope")),
      bad((s) => (s.works[0].openLibraryWorkId = "../../evil")),
      bad((s) => delete s.works[0].updatedAt),
      bad((s) => (s.works[0].subjects = [1])),
      bad((s) => (s.works[0].notes = "x".repeat(10_001))),
    ];
    for (const text of cases) expect(() => parseSnapshotJson(text)).toThrow(ImportError);
  });

  it("strips unknown fields from imported records", async () => {
    await seed();
    const good = JSON.parse(await exportJson());
    good.items[0].extra = "x";
    expect(parseSnapshotJson(JSON.stringify(good)).items[0]).not.toHaveProperty("extra");
  });
});

describe("CSV import", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    fetchBook.mockReset();
  });

  const rows = [
    { title: "One", isbn: "9780000000001" },
    { title: "No ISBN", isbn: null },
    { title: "Missing", isbn: "9780000000002" },
    { title: "Three", isbn: "9780000000003" },
  ];

  it("saves each book like the Save button, skips rows without an ISBN and lists failures", async () => {
    fetchBook.mockImplementation(async (isbn) => {
      if (isbn === "9780000000002") throw new Error("404");
      return apiBook(isbn, `Book ${isbn}`);
    });
    const seen: number[] = [];
    const cached: string[] = [];
    const result = await runCsvImport(rows, NEW_CSV_IMPORT, {
      onProgress: (p) => seen.push(p.next),
      isStopped: () => false,
      onSaved: (book) => cached.push(book.isbn),
      gapMs: 0,
    });
    expect(result).toEqual({ next: 4, saved: 2, alreadySaved: 0, noIsbn: ["No ISBN"], failed: ["Missing"] });
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(cached).toEqual(["9780000000001", "9780000000003"]);
    expect((await getSavedItems()).map((i) => i.id).sort()).toEqual(["9780000000001", "9780000000003"]);
    expect(await getSavedBook("9780000000003")).not.toBeNull();
  });

  it("pauses between rows and resumes from the returned progress without refetching", async () => {
    fetchBook.mockImplementation(async (isbn) => apiBook(isbn, isbn));
    let stop = false;
    const paused = await runCsvImport(rows, NEW_CSV_IMPORT, {
      onProgress: (p) => (stop = p.next === 1),
      isStopped: () => stop,
      gapMs: 0,
    });
    expect(paused.next).toBe(1);
    const done = await runCsvImport(rows, paused, { onProgress: () => {}, isStopped: () => false, gapMs: 0 });
    expect(done).toMatchObject({ next: 4, saved: 3 });
    expect(fetchBook).toHaveBeenCalledTimes(3);
  });

  it("skips books already saved without a lookup, so re-running a file is cheap", async () => {
    fetchBook.mockImplementation(async (isbn) => apiBook(isbn, isbn));
    await runCsvImport(rows, NEW_CSV_IMPORT, { onProgress: () => {}, isStopped: () => false, gapMs: 0 });
    fetchBook.mockClear();
    const again = await runCsvImport(rows, NEW_CSV_IMPORT, { onProgress: () => {}, isStopped: () => false, gapMs: 0 });
    expect(again).toMatchObject({ saved: 0, alreadySaved: 3 });
    expect(fetchBook).not.toHaveBeenCalled();
    expect(await getSavedItems()).toHaveLength(3);
  });

  it("caps the file size and row count", () => {
    expect(() => parseBookCsv("Title,ISBN13\n" + "x".repeat(MAX_IMPORT_BYTES))).toThrow(ImportError);
    expect(() => parseBookCsv("Title,ISBN13\n" + "a,1\n".repeat(MAX_IMPORT_RECORDS + 1))).toThrow(/more than/);
    expect(() => parseBookCsv("Name\nx\n")).toThrow(ImportError);
  });
});
