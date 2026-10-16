import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "@book-explorer/shared";
import AsyncStorage from "../test/asyncStorageMock";
import { getSavedBook, removeSavedBook, saveBookFromApi, updateSavedBook } from "./savedBooks";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const book: Book = {
  isbn: "9780141439518",
  title: "Pride and Prejudice",
  authors: [{ openLibraryId: "OL21594A", name: "Jane Austen" }],
  subjects: ["Courtship"],
  genres: ["Romance"],
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
    const second = await saveBookFromApi({ ...book, subjects: ["Something else"] });
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
});
