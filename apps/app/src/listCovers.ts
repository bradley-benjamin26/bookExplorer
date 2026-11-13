import type { RecentItem } from "./storage/history";
import type { ListMember } from "./storage/savedLists";

export const isbnCoverUrl = (isbn: string): string => `https://covers.openlibrary.org/b/isbn/${isbn}-S.jpg`;

/** A member's cover: books by ISBN (their id), works and authors by Open Library id. */
export const memberCoverUrl = (m: ListMember): string | null => {
  if (m.type === "book") return isbnCoverUrl(m.id);
  if (m.type === "work") return `https://covers.openlibrary.org/w/olid/${m.id}-S.jpg`;
  return `https://covers.openlibrary.org/a/olid/${m.id}-S.jpg`;
};

/** Cover URLs for the first `max` members. */
export const listCoverUrls = (members: ListMember[], max = 3): (string | null)[] => members.slice(0, max).map(memberCoverUrl);

/** A recent book's or work's cover: the one its page showed, else (books only) by ISBN, its id; other kinds have none.
 * Open Library's -M/-L covers are swapped for -S, the size the home list needs. */
export const recentCoverUrl = (item: RecentItem): string | null => {
  if (item.kind !== "book" && item.kind !== "work") return null;
  if (!item.coverUrl) return item.kind === "book" ? isbnCoverUrl(item.id) : null;
  return item.coverUrl.startsWith("https://covers.openlibrary.org/") ? item.coverUrl.replace(/-[ML]\.jpg$/, "-S.jpg") : item.coverUrl;
};
