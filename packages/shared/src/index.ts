import { z } from "zod";

export const AuthorRefSchema = z.object({
  openLibraryId: z.string(),
  name: z.string(),
});
export type AuthorRef = z.infer<typeof AuthorRefSchema>;

// Hardcover and Open Library are both keyless-cost, count-weighted ratings
// pools, so when both have one, they're blended into a single average
// rather than picking just one — `average` is then the count-weighted mean
// across every source listed in `sources`, and `count` their combined
// total. Google Books is never blended in: it's only fetched as a fallback
// when a lookup against it already happened for another reason (cover/
// description), so it's used on its own only when neither of the other two
// has a rating at all — folding it into the blend would mean an extra
// request against its shared quota just to move the average slightly.
export const RatingSchema = z.object({
  average: z.number(),
  count: z.number(),
  sources: z.array(z.enum(["hardcover", "openLibrary", "googleBooks"])).min(1),
});
export type Rating = z.infer<typeof RatingSchema>;

// A single reader's review, from Hardcover — the only one of this app's
// sources with actual review text rather than just an aggregate rating.
export const ReviewSchema = z.object({
  rating: z.number().nullable(),
  text: z.string(),
  hasSpoilers: z.boolean(),
  reviewerName: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const BookSchema = z.object({
  isbn: z.string(),
  title: z.string(),
  authors: z.array(AuthorRefSchema),
  subjects: z.array(z.string()),
  // Distinct from `subjects` (topical — what the book is *about*): a genre
  // is what section of a bookstore or library it'd sit in — "Mystery",
  // "Science fiction", "Memoir". Sourced from LOC's genre/form headings and
  // Wikidata's genre property, both best-effort — many books, especially
  // outside fiction, simply won't have one from either source.
  genres: z.array(z.string()),
  description: z.string().nullable(),
  // Wikipedia and Google Books content require attribution on reuse — the
  // client shows a source credit (linking to descriptionSourceUrl, when
  // one exists) whenever description didn't come from Open Library itself.
  descriptionSource: z.enum(["wikipedia", "googleBooks", "openLibrary"]).nullable(),
  descriptionSourceUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  // Google Books' terms require attribution whenever its cover image is
  // used — the client shows a "powered by Google" credit next to the cover
  // (or folded into the description credit, if that's from Google Books
  // too) whenever the cover is Google Books' own. Hardcover and Open
  // Library covers need no such credit.
  coverSource: z.enum(["googleBooks", "openLibrary", "hardcover"]).nullable(),
  openLibraryWorkId: z.string().nullable(),
  // This edition's own Open Library key (distinct from openLibraryWorkId,
  // which identifies the work all editions share) — lets a client pin a
  // saved record to this specific printing rather than just its ISBN.
  openLibraryEditionId: z.string().nullable(),
  // The Wikidata item matched to this book's work (see bookService's
  // workQid), surfaced so a client can link out to it or key a saved
  // record against it. Null whenever no confident match was found.
  wikidataId: z.string().nullable(),
  // This scanned edition's physical form — "Paperback", "Hardcover",
  // "eBook", etc. Open Library's own catalog term, as typed by whoever
  // catalogued this edition, so it's not a controlled/normalized value.
  format: z.string().nullable(),
  rating: RatingSchema.nullable(),
  reviews: z.array(ReviewSchema),
});
export type Book = z.infer<typeof BookSchema>;

export const AuthorRelationSchema = z.object({
  relation: z.enum(["influencedBy", "influenced", "notableWork", "movement"]),
  wikidataId: z.string(),
  label: z.string(),
  openLibraryId: z.string().nullable(),
});
export type AuthorRelation = z.infer<typeof AuthorRelationSchema>;

export const AuthorSchema = z.object({
  openLibraryId: z.string(),
  name: z.string(),
  wikidataId: z.string().nullable(),
  bio: z.string().nullable(),
  // Wikipedia content is CC BY-SA, which requires attribution on reuse —
  // when `bio` came from Wikipedia rather than Open Library, the client
  // shows a "via Wikipedia" credit linking to bioSourceUrl to satisfy that.
  bioSource: z.enum(["wikipedia", "openLibrary"]).nullable(),
  bioSourceUrl: z.string().nullable(),
  birthDate: z.string().nullable(),
  deathDate: z.string().nullable(),
  relations: z.array(AuthorRelationSchema),
  // Pen names, from Wikidata's P742. Excludes any value matching the
  // author's own `name` — Wikidata sometimes lists an author's real
  // published name as a "preferred" P742 statement alongside their actual
  // pseudonyms, which isn't useful to surface as "also known as".
  pseudonyms: z.array(z.string()),
});
export type Author = z.infer<typeof AuthorSchema>;

// Open Library subject listings return works (title/author, no specific
// edition), not ISBNs — so this is a distinct, lighter-weight concept from
// `Book`, which always represents one scanned edition.
export const WorkRefSchema = z.object({
  openLibraryWorkId: z.string(),
  title: z.string(),
  authors: z.array(AuthorRefSchema),
  coverUrl: z.string().nullable(),
});
export type WorkRef = z.infer<typeof WorkRefSchema>;

// One specific printing of a work — from Open Library's editions listing for
// that work, best-effort (fields are whatever that edition's catalogers
// filled in, so most of these are commonly null on any given entry).
export const EditionSchema = z.object({
  openLibraryEditionId: z.string(),
  isbn: z.string().nullable(),
  format: z.string().nullable(),
  publisher: z.string().nullable(),
  publishDate: z.string().nullable(),
  coverUrl: z.string().nullable(),
});
export type Edition = z.infer<typeof EditionSchema>;

export const WorkSchema = WorkRefSchema.extend({
  description: z.string().nullable(),
  subjects: z.array(z.string()),
  genres: z.array(z.string()),
  // A "work" has no ISBN of its own (that's an edition-level concept) — this
  // is the first ISBN found among its editions, best-effort, so work pages
  // reached other than by scanning (a graph node, an author's notable-works
  // list, ...) can still offer ISBN-based links like a scanned book can.
  isbn: z.string().nullable(),
  editions: z.array(EditionSchema),
  rating: RatingSchema.nullable(),
  reviews: z.array(ReviewSchema),
});
export type Work = z.infer<typeof WorkSchema>;

export const SubjectConceptSchema = z.object({
  relation: z.enum(["broader", "narrower"]),
  wikidataId: z.string(),
  label: z.string(),
});
export type SubjectConcept = z.infer<typeof SubjectConceptSchema>;

export const SubjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  workCount: z.number(),
  wikidataId: z.string().nullable(),
  relatedConcepts: z.array(SubjectConceptSchema),
  books: z.array(WorkRefSchema),
});
export type Subject = z.infer<typeof SubjectSchema>;

/** Open Library's subject URLs are the subject name, lowercased with spaces turned into underscores. */
export function slugifySubject(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["author", "work", "subject", "genre"]),
  label: z.string(),
  // Most nodes link straight to their detail screen. The exception is an
  // author known only by Wikidata QID (no Open Library id) — the author
  // route can't resolve that, so the node is shown but isn't tappable.
  navigable: z.boolean(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphSchema = z.object({
  centerId: z.string(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
export type Graph = z.infer<typeof GraphSchema>;
