import type { Subject } from "@book-explorer/shared";

type Identifier = { source: string; id: string; url: string };

/** Where a subject's data comes from: its Open Library slug, LCSH heading and Wikidata item. Missing sources are omitted. */
export function subjectIdentifiers(s: Pick<Subject, "slug" | "wikidataId" | "lcshUri">): Identifier[] {
  const rows: Identifier[] = [{ source: "Open Library", id: s.slug, url: `https://openlibrary.org/subjects/${s.slug}` }];
  if (s.lcshUri) rows.push({ source: "Library of Congress", id: s.lcshUri.split("/").pop() ?? s.lcshUri, url: s.lcshUri });
  if (s.wikidataId) rows.push({ source: "Wikidata", id: s.wikidataId, url: `https://www.wikidata.org/wiki/${s.wikidataId}` });
  return rows;
}
