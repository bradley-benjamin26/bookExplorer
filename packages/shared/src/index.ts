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

// A subject or genre term and every source that asserted it, so the client can
// badge where each one came from. Declared above BookSchema/WorkSchema, which
// reference it at module load.
export const TaggedTermSchema = z.object({
  label: z.string(),
  sources: z.array(z.enum(["openLibrary", "lcsh", "wikidata"])),
});
export type TaggedTerm = z.infer<typeof TaggedTermSchema>;

export const BookSchema = z.object({
  isbn: z.string(),
  title: z.string(),
  authors: z.array(AuthorRefSchema),
  subjects: z.array(TaggedTermSchema),
  // Distinct from `subjects` (topical — what the book is *about*): a genre
  // is what section of a bookstore or library it'd sit in — "Mystery",
  // "Science fiction", "Memoir". Sourced from LOC's genre/form headings and
  // Wikidata's genre property, both best-effort — many books, especially
  // outside fiction, simply won't have one from either source.
  genres: z.array(TaggedTermSchema),
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
  // Optional enrichment from Open Library; absent when that lookup failed.
  moreByAuthor: z.array(WorkRefSchema).optional(),
});
export type Author = z.infer<typeof AuthorSchema>;

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
  subjects: z.array(TaggedTermSchema),
  genres: z.array(TaggedTermSchema),
  // A "work" has no ISBN of its own (that's an edition-level concept) — this
  // is the first ISBN found among its editions, best-effort, so work pages
  // reached other than by scanning (a graph node, an author's notable-works
  // list, ...) can still offer ISBN-based links like a scanned book can.
  isbn: z.string().nullable(),
  editions: z.array(EditionSchema),
  rating: RatingSchema.nullable(),
  reviews: z.array(ReviewSchema),
  // Optional enrichments (Wikidata P179/P1545, Open Library author works);
  // absent when the work has none or that lookup failed. `position` is text
  // because ordinals aren't always integers ("2.5", "A").
  series: z.object({ name: z.string(), position: z.string().nullable(), wikidataId: z.string() }).optional(),
  moreByAuthor: z.array(WorkRefSchema).optional(),
});
export type Work = z.infer<typeof WorkSchema>;

export const SubjectConceptSchema = z.object({
  relation: z.enum(["broader", "narrower"]),
  wikidataId: z.string().nullable(),
  label: z.string(),
  sources: z.array(z.enum(["wikidata", "lcsh"])),
});
export type SubjectConcept = z.infer<typeof SubjectConceptSchema>;

export const SubjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  workCount: z.number(),
  wikidataId: z.string().nullable(),
  description: z.string().nullable(),
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
  // "editions" is a single summary node per work (not one node per
  // edition — see graphService.buildWorkGraph) whose only purpose is
  // pointing a viewer at the Editions section on that work's own page,
  // rather than being a browsable concept in its own right the way every
  // other node type is.
  type: z.enum(["author", "work", "subject", "genre", "editions"]),
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

/**
 * /api/path: the chain of nodes from one end to the other, with edges[i]
 * joining nodes[i] and nodes[i + 1] (in either direction), or why none was found.
 */
/** One chain between the two ends, with a one-line summary of what links them. */
export const GraphPathSchema = z.object({ nodes: z.array(GraphNodeSchema), edges: z.array(GraphEdgeSchema), summary: z.string() });
export type GraphPath = z.infer<typeof GraphPathSchema>;

// `paths` is ordered most specific first.
export const PathResultSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(true), paths: z.array(GraphPathSchema).min(1) }),
  z.object({ found: z.literal(false), reason: z.enum(["noPath", "depthCap", "nodeCap", "timeout", "upstreamUnavailable"]) }),
]);
export type PathResult = z.infer<typeof PathResultSchema>;

/**
 * Strips everything but digits and a check-digit "X" from an ISBN — barcode
 * scans yield bare digits, but typed or pasted ISBNs are often hyphenated
 * ("978-0-06-325085-7"). Used by the server (so every source lookup and the
 * cache key share one form) and by the app (so a saved book's record, keyed
 * by the server's normalized ISBN, is found again however the ISBN was
 * entered).
 */
export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

/** An ISBN-10 or ISBN-13, hyphens/spaces allowed. */
export function isValidIsbn(raw: string): boolean {
  return /^(\d{9}[\dX]|\d{13})$/.test(normalizeIsbn(raw));
}

// Caps on an imported backup/CSV file, which is untrusted input: big enough
// for any real library, small enough that parsing it can't hang the app.
export const MAX_IMPORT_BYTES = 5_000_000;
export const MAX_IMPORT_RECORDS = 10_000;

// Imported records must carry their own updatedAt (no "now" fallback), so a
// merge of the same file always gives the same result.
const VersionedFields = {
  schemaVersion: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
};
const text = z.string().max(10_000);
const tagList = z.array(z.string().max(500)).max(1_000);
// Library URLs are opened as links, so an imported file mustn't be able to
// plant a javascript: or other non-web URL.
const webUrl = z.string().max(2_000).regex(/^(https?:\/\/.*)?$/i);

export const SavedItemExportSchema = z.object({
  ...VersionedFields,
  deletedAt: z.number().int().nonnegative().optional(),
  type: z.enum(["book", "work", "author"]),
  id: z.string().min(1).max(200),
  title: text,
});

export const SavedBookExportSchema = z.object({
  ...VersionedFields,
  deletedAt: z.number().int().nonnegative().optional(),
  // Becomes part of a storage key, so only the server's normalized form.
  isbn: z.string().regex(/^(\d{9}[\dX]|\d{13})$/),
  wikidataId: z.string().max(200).nullable(),
  openLibraryEditionId: z.string().max(200).nullable(),
  openLibraryWorkId: z.string().max(200).nullable(),
  title: text,
  authorNames: tagList,
  format: z.string().max(200).nullable(),
  subjects: tagList,
  genres: tagList,
  notes: text,
  savedAt: z.number().int().nonnegative(),
});

export const SavedWorkExportSchema = z.object({
  ...VersionedFields,
  deletedAt: z.number().int().nonnegative().optional(),
  // Becomes part of a storage key, so only Open Library's work id form.
  openLibraryWorkId: z.string().regex(/^OL\d+W$/),
  title: text,
  authorNames: tagList,
  subjects: tagList,
  genres: tagList,
  notes: text,
  savedAt: z.number().int().nonnegative(),
});

export const LibraryExportSchema = z.object({
  ...VersionedFields,
  id: z.string().min(1).max(200),
  name: z.string().max(500),
  isbnUrl: webUrl,
  titleUrl: webUrl,
});

/**
 * A JSON backup file: the app's whole saved dataset (see the app's storage/snapshot.ts).
 * Version 1 files predate saved-work records, so they have no `works` and read as none;
 * from version 2 on `works` is required. (A newer schemaVersion is the app's to reject.)
 */
export const SnapshotExportSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    items: z.array(SavedItemExportSchema).max(MAX_IMPORT_RECORDS),
    books: z.array(SavedBookExportSchema).max(MAX_IMPORT_RECORDS),
    works: z.array(SavedWorkExportSchema).max(MAX_IMPORT_RECORDS).optional(),
    libraries: z.array(LibraryExportSchema).max(MAX_IMPORT_RECORDS),
  })
  .refine((s) => s.schemaVersion < 2 || s.works !== undefined, { message: "works is required from schemaVersion 2", path: ["works"] })
  .transform(({ works = [], ...rest }) => ({ ...rest, works }));
export type SnapshotExport = z.infer<typeof SnapshotExportSchema>;

export const SeriesMemberSchema = z.object({
  wikidataId: z.string(),
  title: z.string(),
  position: z.string().nullable(),
  // Wikidata doesn't always know the Open Library id, so not every member is navigable.
  openLibraryWorkId: z.string().nullable(),
});
export type SeriesMember = z.infer<typeof SeriesMemberSchema>;

export const SeriesSchema = z.object({
  wikidataId: z.string(),
  name: z.string(),
  members: z.array(SeriesMemberSchema),
});
export type Series = z.infer<typeof SeriesSchema>;
