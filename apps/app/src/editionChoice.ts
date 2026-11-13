import type { Edition } from "@book-explorer/shared";
import type { SavedBookRecord } from "./storage/savedBooks";

/** Editions that have an ISBN, once per ISBN, in the order given. */
export const isbnEditions = (editions: Edition[]): Edition[] =>
  editions.filter((e, i) => e.isbn && editions.findIndex((o) => o.isbn === e.isbn) === i);

/** The first live saved book that is an edition of `workId`. */
export const savedEditionOf = (books: SavedBookRecord[], workId: string): SavedBookRecord | null =>
  books.find((b) => !b.deletedAt && b.openLibraryWorkId === workId) ?? null;

/** Screen-reader label for the "View saved edition" button, so the visible text can stay short. */
export const savedEditionLabel = (rec: { format: string | null; isbn: string }): string =>
  `View saved edition: ${rec.format ?? "edition"} ${rec.isbn}`;
