import type { SavedBookRecord } from "./storage/savedBooks";

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
const EXPORT_HEADER = ["Title", "Author", "Additional Authors", "ISBN", "ISBN13", "Bookshelves", "Private Notes", "Date Added"];

const goodreadsDate = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "/");

/** Live saved books as a Goodreads-style CSV: tags (subjects + genres) go in Bookshelves. */
export function booksToCsv(books: SavedBookRecord[]): string {
  const rows = books
    .filter((b) => !b.deletedAt)
    .map((b) => [
      b.title,
      b.authorNames[0] ?? "",
      b.authorNames.slice(1).join(", "),
      b.isbn.length === 10 ? b.isbn : "",
      b.isbn.length === 13 ? b.isbn : "",
      [...new Set([...b.subjects, ...b.genres])].join(", "),
      b.notes,
      goodreadsDate(b.savedAt),
    ]);
  return toCsv([EXPORT_HEADER, ...rows]);
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
      .find((v) => /^(\d{9}[\dX]|\d{13})$/.test(v));
    return { title: r[title]?.trim() ?? "", isbn: isbn ?? null };
  });
}
