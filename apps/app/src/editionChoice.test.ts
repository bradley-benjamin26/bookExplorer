import { describe, expect, it } from "vitest";
import { isbnEditions, savedEditionLabel, savedEditionOf } from "./editionChoice";
import type { SavedBookRecord } from "./storage/savedBooks";

const e = (id: string, isbn: string | null) => ({ openLibraryEditionId: id, isbn, format: null, publisher: null, publishDate: null, coverUrl: null });
const book = (isbn: string, workId: string | null, deletedAt?: number) =>
  ({ isbn, openLibraryWorkId: workId, deletedAt }) as SavedBookRecord;

describe("isbnEditions", () => {
  it("keeps editions with an ISBN, once each", () => {
    expect(isbnEditions([e("1", "111"), e("2", null), e("3", "111"), e("4", "222")]).map((x) => x.openLibraryEditionId)).toEqual(["1", "4"]);
  });
});

describe("savedEditionOf", () => {
  it("finds the live saved book of the work", () => {
    const books = [book("1", "OL1W", 5), book("2", "OL2W"), book("3", "OL1W")];
    expect(savedEditionOf(books, "OL1W")?.isbn).toBe("3");
    expect(savedEditionOf(books, "OL9W")).toBeNull();
  });
});

describe("savedEditionLabel", () => {
  it("names the format and ISBN", () => {
    expect(savedEditionLabel({ format: "Paperback", isbn: "9780141439518" })).toBe("View saved edition: Paperback 9780141439518");
  });
  it("falls back to 'edition'", () => {
    expect(savedEditionLabel({ format: null, isbn: "9780141439518" })).toBe("View saved edition: edition 9780141439518");
  });
});
