import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "@book-explorer/shared";
import AsyncStorage from "../test/asyncStorageMock";
import { getSavedBook, removeSavedBook, saveBook, saveBookFromApi, unsaveBook, updateSavedBook } from "./savedBooks";
import { getSavedItems } from "./savedItems";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const book: Book = {
  isbn: "9780141439518",
  title: "Pride and Prejudice",
  authors: [{ openLibraryId: "OL21594A", name: "Jane Austen" }],
  subjects: [{ label: "Courtship", sources: ["openLibrary"] }],
  genres: [{ label: "Romance", sources: ["openLibrary"] }],
  description: null,
  descriptionSource: null,
  descriptionSourceUrl: null,
  coverUrl: null,
  coverSource: null,
  openLibraryWorkId: "OL66554W",
  openLibraryEditionId: null,
  wikidataId: null,
  format: null,
  rating: null,
  reviews: [],
};

describe("savedBooks", () => {
  beforeEach(() => AsyncStorage.clear());

  it("snapshots the book's tags on first save and keeps the existing record on a second save", async () => {
    const first = await saveBookFromApi(book);
    expect(first.subjects).toEqual(["Courtship"]);
    await updateSavedBook(book.isbn, { notes: "loved it" });
    const second = await saveBookFromApi({ ...book, subjects: [{ label: "Something else", sources: ["lcsh"] }] });
    expect(second.notes).toBe("loved it");
    expect(second.subjects).toEqual(["Courtship"]);
  });

  it("keeps every change when updates overlap", async () => {
    await saveBookFromApi(book);
    await Promise.all([
      updateSavedBook(book.isbn, { subjects: ["A"] }),
      updateSavedBook(book.isbn, { genres: ["B"] }),
      updateSavedBook(book.isbn, { notes: "C" }),
    ]);
    const record = await getSavedBook(book.isbn);
    expect(record).toMatchObject({ subjects: ["A"], genres: ["B"], notes: "C" });
  });

  it("returns null when updating a book that isn't saved", async () => {
    expect(await updateSavedBook(book.isbn, { notes: "x" })).toBeNull();
    expect(await getSavedBook(book.isbn)).toBeNull();
  });

  it("doesn't let an update that started before a removal recreate the record", async () => {
    await saveBookFromApi(book);
    const update = updateSavedBook(book.isbn, { notes: "late write" });
    // Let the update's read get underway, so the removal lands between that
    // read and its write — the window where an unqueued removal used to be
    // undone by the write that followed it.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const removal = removeSavedBook(book.isbn);
    await Promise.all([update, removal]);
    expect(await getSavedBook(book.isbn)).toBeNull();
  });

  it("reads see writes that were queued before them", async () => {
    await saveBookFromApi(book);
    void updateSavedBook(book.isbn, { notes: "pending" });
    expect((await getSavedBook(book.isbn))?.notes).toBe("pending");
    void removeSavedBook(book.isbn);
    expect(await getSavedBook(book.isbn)).toBeNull();
  });

  it("starts fresh after the record is removed", async () => {
    await saveBookFromApi(book);
    await updateSavedBook(book.isbn, { notes: "old" });
    await removeSavedBook(book.isbn);
    expect(await getSavedBook(book.isbn)).toBeNull();
    expect((await saveBookFromApi(book)).notes).toBe("");
  });

  it("blanks notes and tags when the record is tombstoned", async () => {
    await saveBookFromApi(book);
    await updateSavedBook(book.isbn, { notes: "private" });
    await removeSavedBook(book.isbn);
    const raw = JSON.parse((await AsyncStorage.getItem(`book-explorer:saved-book:${book.isbn}`))!);
    expect(raw).toMatchObject({ isbn: book.isbn, notes: "", subjects: [], genres: [] });
    expect(raw.deletedAt).toBeGreaterThan(0);
  });
});

describe("saveBook", () => {
  beforeEach(() => AsyncStorage.clear());

  it("never unsaves: saving an already-saved book keeps it saved with its notes", async () => {
    await saveBook(book);
    await updateSavedBook(book.isbn, { notes: "loved it" });
    expect((await saveBook(book)).notes).toBe("loved it");
    expect(await getSavedItems()).toMatchObject([{ type: "book", id: book.isbn }]);
  });

  it("a book opened by its ISBN-10 reads as saved under the ISBN the server returned", async () => {
    // The book page looks the record up by data.isbn, the key saveBook stores under, not the route's ISBN.
    await saveBook(book); // fetched via route ISBN-10 0141439513, server returned the ISBN-13
    expect(await getSavedBook(book.isbn)).not.toBeNull();
    expect(await getSavedBook("0141439513")).toBeNull();
  });

  it("unsaveBook removes both the index entry and the record", async () => {
    await saveBook(book);
    await unsaveBook(book.isbn);
    expect(await getSavedItems()).toEqual([]);
    expect(await getSavedBook(book.isbn)).toBeNull();
  });
});
