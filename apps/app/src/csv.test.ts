import { describe, expect, it } from "vitest";
import type { SavedList } from "./storage/savedLists";
import { booksToCsv, parseCsv, readBookCsv, toCsv } from "./csv";
import type { SavedBookRecord } from "./storage/savedBooks";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, newlines in fields and CRLF", () => {
    expect(parseCsv('a,"b,c","say ""hi""","line1\nline2"\r\nx,y,,z\r\n')).toEqual([
      ["a", "b,c", 'say "hi"', "line1\nline2"],
      ["x", "y", "", "z"],
    ]);
  });

  it("drops a leading BOM and blank lines, and keeps a last row with no newline", () => {
    expect(parseCsv("﻿Title,ISBN\n\nA,1")).toEqual([
      ["Title", "ISBN"],
      ["A", "1"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["plain", 'q"uote', "com,ma", "new\nline", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("readBookCsv", () => {
  it("reads Goodreads' ISBN13, falling back to ISBN, and unwraps the =\"…\" Excel guard", () => {
    const csv = 'Book Id,Title,ISBN,ISBN13\n1,"Dune, Deluxe","=""0441013597""","=""9780441013593"""\n2,Old,"=""0441013597""","="""""\n3,None,"=""""","="""""\n';
    expect(readBookCsv(csv)).toEqual([
      { title: "Dune, Deluxe", isbn: "9780441013593" },
      { title: "Old", isbn: "0441013597" },
      { title: "None", isbn: null },
    ]);
  });

  it("reads StoryGraph's ISBN/UID column, ignoring a non-ISBN UID", () => {
    const csv = "Title,Authors,ISBN/UID,Format\nA,X,9780441013593,paperback\nB,Y,a1b2c3d4-0000-1111-2222-333344445555,ebook\n";
    expect(readBookCsv(csv)).toEqual([
      { title: "A", isbn: "9780441013593" },
      { title: "B", isbn: null },
    ]);
  });

  it("rejects a CSV with neither layout", () => {
    expect(() => readBookCsv("Name,Code\nA,1\n")).toThrow(/Goodreads or StoryGraph/);
  });
});

describe("booksToCsv", () => {
  const record: SavedBookRecord = {
    schemaVersion: 1,
    updatedAt: 1,
    isbn: "9780441013593",
    wikidataId: null,
    openLibraryEditionId: null,
    openLibraryWorkId: null,
    title: 'Dune, "the" novel',
    authorNames: ["Frank Herbert", "Someone Else"],
    format: null,
    subjects: ["sf", "desert"],
    genres: ["sf"],
    notes: "line1\nline2",
    savedAt: Date.UTC(2024, 0, 15),
  };

  const list = (name: string, over: Partial<SavedList> = {}): SavedList => ({
    schemaVersion: 1, updatedAt: 1, id: name, name, description: "", kind: "book", createdAt: 1,
    members: [{ type: "book", id: record.isbn, title: "Dune", addedAt: 1 }], ...over,
  });

  it("Bookshelves holds the book's live book-list names as Goodreads shelf slugs, never subjects", () => {
    const hugo = { ...record, subjects: ["Award:Hugo_Award=1966"] };
    const lists = [list("Book Club 2026"), list("Gone", { deletedAt: 3 }), list("Authors", { kind: "author" }), list("Other", { members: [] })];
    const [header, row] = parseCsv(booksToCsv([hugo], lists));
    const r = Object.fromEntries(header.map((h, i) => [h, row[i]]));
    expect(r.Bookshelves).toBe("book-club-2026");
    expect(r["Exclusive Shelf"]).toBe("to-read");
  });

  it("a book in several lists joins their slugs with a comma and parses back", () => {
    const csv = booksToCsv([record], [list("A List"), list("B List")]);
    expect(csv).toContain('"a-list, b-list"');
    const [header, row] = parseCsv(csv);
    expect(row[header.indexOf("Bookshelves")]).toBe("a-list, b-list");
    expect(readBookCsv(csv)).toEqual([{ title: 'Dune, "the" novel', isbn: "9780441013593" }]);
  });

  it("drops a list whose name slugs to nothing", () => {
    const [header, row] = parseCsv(booksToCsv([record], [list("!!!"), list("Keep")]));
    expect(row[header.indexOf("Bookshelves")]).toBe("keep");
  });

  it("a book in no list exports an empty Bookshelves", () => {
    const [header, row] = parseCsv(booksToCsv([record], []));
    expect(row[header.indexOf("Bookshelves")]).toBe("");
  });

  it('a list named "=HYPERLINK(x)" is neutralised because the slug replaces the name', () => {
    const [header, row] = parseCsv(booksToCsv([record], [list("=HYPERLINK(x)")]));
    expect(row[header.indexOf("Bookshelves")]).toBe("hyperlink-x");
  });

  it("writes Goodreads columns for live books and reads back through readBookCsv", () => {
    const csv = booksToCsv([record, { ...record, isbn: "0441013597", deletedAt: 5 }], []);
    const [header, row, ...rest] = parseCsv(csv);
    expect(rest).toEqual([]);
    expect(Object.fromEntries(header.map((h, i) => [h, row[i]]))).toEqual({
      Title: 'Dune, "the" novel',
      Author: "Frank Herbert",
      "Additional Authors": "Someone Else",
      ISBN: "",
      ISBN13: "9780441013593",
      Bookshelves: "",
      "Exclusive Shelf": "to-read",
      "Private Notes": "line1\nline2",
      "Date Added": "2024/01/15",
    });
    expect(readBookCsv(csv)).toEqual([{ title: 'Dune, "the" novel', isbn: "9780441013593" }]);
  });

  it("neutralizes cells a spreadsheet would run as formulas", () => {
    const evil = { ...record, title: '=HYPERLINK("http://x")', authorNames: ["+1", "@SUM(A1)"], notes: "-2", genres: [] };
    const [, row] = parseCsv(booksToCsv([evil], []));
    expect([row[0], row[1], row[2], row[7]]).toEqual(["'=HYPERLINK(\"http://x\")", "'+1", "'@SUM(A1)", "'-2"]);
  });
});
