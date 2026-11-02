import type { ListMember } from "./storage/savedLists";

/** Cover URLs for the first `max` members. Lists keep ids and titles only, so only books (id = ISBN)
 * have a cover to look up; works and authors give `null` and render a placeholder. */
export const listCoverUrls = (members: ListMember[], max = 3): (string | null)[] =>
  members.slice(0, max).map((m) => (m.type === "book" ? `https://covers.openlibrary.org/b/isbn/${m.id}-S.jpg` : null));
