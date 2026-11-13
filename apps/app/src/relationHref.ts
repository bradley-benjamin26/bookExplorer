import type { Href } from "expo-router";
import type { AuthorRelation } from "@book-explorer/shared";
import { routes } from "./navigation";

/** The page a relation row on an author page opens, or null when it stays plain text. */
export function relationHref(r: Pick<AuthorRelation, "relation" | "openLibraryId" | "label">): Href | null {
  const id = r.openLibraryId;
  if (!id) return null;
  if (r.relation === "notableWork") return /^OL\d+W$/.test(id) ? routes.work(id) : null;
  if (r.relation === "influencedBy" || r.relation === "influenced") return id.endsWith("W") ? routes.work(id) : routes.author(id);
  return null;
}
