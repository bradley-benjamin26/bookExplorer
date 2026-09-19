import type { Book } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";
import * as googleBooks from "../sources/googleBooks.js";

const bookCache = new TtlCache<Book | null>(1000 * 60 * 60);

/** Shared by the /api/books route (a future /api/graph/book route would reuse this too). */
export function getBookDetail(isbn: string): Promise<Book | null> {
  return bookCache.wrap(isbn, async () => {
    const ol = await openLibrary.lookupByIsbn(isbn);
    if (!ol) return null;

    let coverUrl = ol.coverUrl;
    let description = ol.description;

    if (!coverUrl || !description) {
      const gb = await googleBooks.lookupByIsbn(isbn).catch(() => null);
      coverUrl = coverUrl ?? gb?.coverUrl ?? null;
      description = description ?? gb?.description ?? null;
    }

    const result: Book = {
      isbn,
      title: ol.title,
      authors: ol.authors,
      subjects: ol.subjects,
      description,
      coverUrl,
      openLibraryWorkId: ol.workId,
    };
    return result;
  });
}
