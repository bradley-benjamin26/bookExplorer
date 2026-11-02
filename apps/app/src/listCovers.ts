import type { RecentItem } from "./storage/history";
import type { ListMember } from "./storage/savedLists";

export const isbnCoverUrl = (isbn: string): string => `https://covers.openlibrary.org/b/isbn/${isbn}-S.jpg`;

/** Cover URLs for the first `max` members. Lists keep ids and titles only, so only books (id = ISBN)
 * have a cover to look up; works and authors give `null` and render a placeholder. */
export const listCoverUrls = (members: ListMember[], max = 3): (string | null)[] =>
  members.slice(0, max).map((m) => (m.type === "book" ? isbnCoverUrl(m.id) : null));

/** A recently viewed book's cover: the one its page showed, else by ISBN (its id); other kinds have none.
 * Open Library's -M/-L covers are swapped for -S, the size the home list needs. */
export const recentCoverUrl = (item: RecentItem): string | null => {
  if (item.kind !== "book") return null;
  if (!item.coverUrl) return isbnCoverUrl(item.id);
  return item.coverUrl.startsWith("https://covers.openlibrary.org/") ? item.coverUrl.replace(/-[ML]\.jpg$/, "-S.jpg") : item.coverUrl;
};
