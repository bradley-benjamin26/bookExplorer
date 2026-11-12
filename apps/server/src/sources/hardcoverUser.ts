import type { HardcoverListBooks, HardcoverListSummary, HardcoverProgress } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import { hardcoverGraphql } from "./hardcover.js";

const BOOK_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MISSING_BOOK_TTL_MS = 10 * 60_000;
const MAX_ISBNS = 20;
// Hardcover's status_id values; 6 is "ignored", which we treat as not shelved.
const STATUS = { 1: "want", 2: "reading", 3: "read", 4: "paused", 5: "dnf" } as const;

// Book ids are the same for every user, so this cache is shared.
const bookIdCache = new TtlCache<number | null>(BOOK_ID_TTL_MS, 1000, "hardcover-book-id");

type Edition = { isbn_13: string | null; isbn_10: string | null } | null;
const isbnOf = (e: Edition | undefined) => e?.isbn_13 || e?.isbn_10 || null;

export function findBookId(isbns: string[], auth: string): Promise<number | null> {
  const list = [...new Set(isbns)].sort().slice(0, MAX_ISBNS);
  if (!list.length) return Promise.resolve(null);
  return bookIdCache.wrap(list.join(","), async (entry) => {
    const data = await hardcoverGraphql<{ editions: { book_id: number | string }[] }>(
      `query($isbns: [String!]) { editions(where: {_or: [{isbn_13: {_in: $isbns}}, {isbn_10: {_in: $isbns}}]}, limit: 1) { book_id } }`,
      { isbns: list },
      auth
    );
    const id = data.editions[0]?.book_id;
    if (id == null) entry.ttlMs = MISSING_BOOK_TTL_MS;
    return id == null ? null : Number(id);
  });
}

export async function myLists(auth: string): Promise<HardcoverListSummary[]> {
  const data = await hardcoverGraphql<{ me: { lists: { id: number | string; name: string; description: string | null; books_count: number | string | null }[] }[] }>(
    `{ me { lists(order_by: {updated_at: desc}) { id name description books_count } } }`,
    {},
    auth
  );
  return (data.me[0]?.lists ?? []).map((l) => ({ id: Number(l.id), name: l.name, description: l.description ?? "", booksCount: Number(l.books_count ?? 0) }));
}

export async function listBooks(listId: number, auth: string): Promise<HardcoverListBooks | null> {
  const data = await hardcoverGraphql<{
    lists_by_pk: {
      name: string;
      description: string | null;
      books_count: number | string | null;
      list_books: { book_id: number | string; book: { title: string; default_physical_edition: Edition } | null; edition: Edition }[];
    } | null;
  }>(
    `query($id: Int!) { lists_by_pk(id: $id) { name description books_count list_books(order_by: {position: asc}) { book_id book { title default_physical_edition { isbn_13 isbn_10 } } edition { isbn_13 isbn_10 } } } }`,
    { id: listId },
    auth
  );
  const list = data.lists_by_pk;
  if (!list) return null;
  return {
    name: list.name,
    description: list.description ?? "",
    booksCount: Number(list.books_count ?? 0),
    books: list.list_books.map((b) => ({
      hardcoverBookId: Number(b.book_id),
      title: b.book?.title ?? "",
      isbn: isbnOf(b.edition) ?? isbnOf(b.book?.default_physical_edition),
    })),
  };
}

export async function createList(input: { name: string; description: string }, auth: string): Promise<number> {
  const data = await hardcoverGraphql<{ insert_list: { id: number | string | null } | null }>(
    `mutation($name: String!, $description: String!) { insert_list(object: {name: $name, description: $description, privacy_setting_id: 3}) { id } }`,
    input,
    auth,
    { retry: false }
  );
  const id = data.insert_list?.id;
  if (id == null) throw new Error("Hardcover did not create the list");
  return Number(id);
}

export async function addListBook(listId: number, bookId: number, auth: string): Promise<void> {
  await hardcoverGraphql(
    `mutation($listId: Int!, $bookId: Int!) { insert_list_book(object: {list_id: $listId, book_id: $bookId}) { id } }`,
    { listId, bookId },
    auth,
    { retry: false }
  );
}

export async function removeListBook(listId: number, bookId: number, auth: string): Promise<void> {
  const data = await hardcoverGraphql<{ list_books: { id: number | string }[] }>(
    `query($listId: Int!, $bookId: Int!) { list_books(where: {list_id: {_eq: $listId}, book_id: {_eq: $bookId}}) { id } }`,
    { listId, bookId },
    auth
  );
  for (const row of data.list_books) {
    await hardcoverGraphql(`mutation($id: Int!) { delete_list_book(id: $id) { id } }`, { id: Number(row.id) }, auth, { retry: false });
  }
}

export async function readingProgress(bookId: number, auth: string): Promise<HardcoverProgress> {
  const data = await hardcoverGraphql<{
    me: {
      user_books: {
        status_id: number;
        edition: { pages: number | null } | null;
        book: { pages: number | null } | null;
        user_book_reads: { progress_pages: number | null }[];
      }[];
    }[];
  }>(
    `query($bookId: Int!) { me { user_books(where: {book_id: {_eq: $bookId}}) { status_id edition { pages } book { pages } user_book_reads(order_by: {id: desc}, limit: 1) { progress_pages } } } }`,
    { bookId },
    auth
  );
  const row = data.me[0]?.user_books[0];
  const status = row ? (STATUS[Number(row.status_id) as keyof typeof STATUS] ?? null) : null;
  if (!row || !status) return { status: null, percent: null };
  const pages = row.edition?.pages || row.book?.pages;
  const done = row.user_book_reads[0]?.progress_pages;
  const percent = status === "reading" && pages && done != null ? Math.round(Math.min(100, (done / pages) * 100)) : null;
  return { status, percent };
}
