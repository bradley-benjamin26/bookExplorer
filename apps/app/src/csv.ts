import { ISBN_PATTERN } from "@book-explorer/shared";
import type { SavedBookRecord } from "./storage/savedBooks";
import type { SavedList } from "./storage/savedLists";
import type { SavedWorkRecord } from "./storage/savedWorks";

/** RFC 4180 rows: quoted fields may hold commas, newlines and "" escapes; a leading BOM is dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') field += src[i++];
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      rows.push([...row, field]);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f.trim()));
}

const quote = (f: string) => (/[",\r\n]/.test(f) ? `"${f.replaceAll('"', '""')}"` : f);

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}

// Goodreads export column names, so the file imports into Goodreads (and back into this app).
const EXPORT_HEADER = ["Title", "Author", "Additional Authors", "ISBN", "ISBN13", "Bookshelves", "Exclusive Shelf", "Private Notes", "Date Added"];

const goodreadsDate = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "/");

// A cell starting with one of these runs as a formula when the CSV is opened in a
// spreadsheet; a leading ' makes it plain text (OWASP's CSV injection advice).
const noFormula = (f: string) => (/^[=+\-@\t\r]/.test(f) ? `'${f}` : f);

export const shelfSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ="…" as Goodreads writes it, or a spreadsheet drops an ISBN-10's leading zero and turns an ISBN-13
// into 9.78E+12; readBookCsv unwraps it. Added after noFormula, which would neutralize the "=".
const isbnCell = (isbn: string) => `="${isbn}"`;

/** Live saved books and works as a Goodreads-style CSV: the names of the book lists an item is in are its shelves. A work has no ISBN of its own, so its ISBN cells come from `workIsbn` (empty when it gives none). */
export function booksToCsv(
  books: SavedBookRecord[],
  lists: SavedList[],
  works: SavedWorkRecord[] = [],
  workIsbn: (workId: string) => string | null = () => null
): string {
  const bookLists = lists.filter((l) => l.kind === "book" && !l.deletedAt);
  const shelves = (type: "book" | "work", id: string) =>
    bookLists
      .filter((l) => l.members.some((m) => m.type === type && m.id === id))
      .map((l) => shelfSlug(l.name))
      .filter(Boolean)
      .join(", ");
  const row = (title: string, authors: string[], shelf: string, notes: string, savedAt: number, isbn: string | null) => {
    const r = [title, authors[0] ?? "", authors.slice(1).join(", "), "", "", shelf, "to-read", notes, goodreadsDate(savedAt)].map(noFormula);
    if (isbn) r[isbn.length === 10 ? 3 : 4] = isbnCell(isbn);
    return r;
  };
  const bookRows = books
    .filter((b) => !b.deletedAt)
    .map((b) => row(b.title, b.authorNames, shelves("book", b.isbn), b.notes, b.savedAt, b.isbn));
  const workRows = works
    .filter((w) => !w.deletedAt)
    .map((w) => row(w.title, w.authorNames, shelves("work", w.openLibraryWorkId), w.notes, w.savedAt, workIsbn(w.openLibraryWorkId)));
  return toCsv([EXPORT_HEADER, ...bookRows, ...workRows]);
}

export interface CsvBookRow {
  title: string;
  isbn: string | null; // null when the row has no usable ISBN
}

/**
 * The title and ISBN of each row of a Goodreads or StoryGraph export, told
 * apart by header: StoryGraph has one "ISBN/UID" column (a non-ISBN UID when
 * the book has none), Goodreads has ISBN13 and ISBN wrapped as ="…" for Excel.
 * Throws when neither layout matches.
 */
export function readBookCsv(text: string): CsvBookRow[] {
  const [header = [], ...rows] = parseCsv(text);
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const title = col("Title");
  const isbnCols = col("ISBN/UID") >= 0 ? [col("ISBN/UID")] : [col("ISBN13"), col("ISBN")].filter((i) => i >= 0);
  if (title < 0 || isbnCols.length === 0) throw new Error("Not a Goodreads or StoryGraph export: no Title and ISBN columns.");
  return rows.map((r) => {
    // Only a field that is wholly an ISBN: stripping a StoryGraph UID down to its digits could fake one.
    const isbn = isbnCols
      .map((i) => (r[i] ?? "").replace(/[="\s-]/g, "").toUpperCase())
      .find((v) => ISBN_PATTERN.test(v));
    return { title: r[title]?.trim() ?? "", isbn: isbn ?? null };
  });
}
