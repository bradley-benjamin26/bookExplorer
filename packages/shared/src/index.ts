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

const MACHINE_TAG = /^[a-z_]+:\S/i;

/** Splits raw Open Library subject strings into real subjects and readable awards; other machine tags ("nyt:...", "series:...") are dropped. */
export function splitSubjectTerms(labels: string[]): { subjects: string[]; awards: string[] } {
  const subjects: string[] = [];
  const awards = new Map<string, string>();
  for (const label of labels) {
    if (!MACHINE_TAG.test(label)) {
      subjects.push(label);
      continue;
    }
    const m = /^award:(.+)$/i.exec(label);
    if (!m) continue;
    const [name, qualifier] = m[1].split("=", 2);
    const award = name.replace(/_/g, " ").trim() + (qualifier?.trim() ? ` (${qualifier.trim()})` : "");
    const key = award.toLowerCase();
    if (!awards.has(key)) awards.set(key, award);
  }
  return { subjects, awards: [...awards.values()] };
}

/** Dedupe key: near-duplicate subjects ("Science-Fiction" / "science fiction", "X, fiction" / "X") share one. */
export function subjectKey(label: string): string {
  const plain = label.trim().toLowerCase();
  return plain.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim().replace(/,\s*fiction$/, "") || plain;
}

// The Library of Congress catalog record's call number, Dewey class and
// control number; present only when LOC has catalogued the book (an LCCN).
export const LocCatalogSchema = z.object({ lcc: z.string().nullable(), ddc: z.string().nullable(), lccn: z.string() });

export const BookSchema = z.object({
  isbn: z.string(),
  title: z.string(),
  authors: z.array(AuthorRefSchema),
  subjects: z.array(TaggedTermSchema),
  awards: z.array(z.string()).default([]),
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
  descriptionSource: z.enum(["wikipedia", "googleBooks", "openLibrary", "loc"]).nullable(),
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
  loc: LocCatalogSchema.nullable().optional(),
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
  relation: z.enum(["influencedBy", "influenced", "notableWork", "movement", "award"]),
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
  // Wikipedia's lead image; optional because older cached entries lack it.
  photoUrl: z.string().nullable().optional(),
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
  descriptionSource: z.enum(["openLibrary", "loc"]).nullable().optional(),
  loc: LocCatalogSchema.nullable().optional(),
  subjects: z.array(TaggedTermSchema),
  awards: z.array(z.string()).default([]),
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

/**
 * Open Library's subject URLs: the name lowercased, with spaces turned into
 * underscores. LCSH's "--" subdivisions and commas are dropped, since Open
 * Library files "Science fiction -- Authorship" as science_fiction_authorship;
 * hyphens, apostrophes, parentheses and periods stay (they make different
 * subjects there). Idempotent, so it also turns a legacy slug canonical.
 */
export function slugifySubject(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/,/g, "") // first, so "-,-" can't leave a new "--" behind
    .replace(/--/g, " ")
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** One award from its dated or per-category spellings: "Hugo Award (1966)" and "Hugo Award for Best Novella" are both "Hugo Award". */
export function awardFamily(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+for\s.*$/i, "").trim();
}

export const GraphNodeSchema = z.object({
  id: z.string(),
  // "editions" is a single summary node per work (not one node per
  // edition — see graphService.buildWorkGraph) whose only purpose is
  // pointing a viewer at the Editions section on that work's own page,
  // rather than being a browsable concept in its own right the way every
  // other node type is.
  type: z.enum(["author", "work", "subject", "genre", "editions", "award"]),
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

/** An ISBN-10 or ISBN-13 in normalizeIsbn's form. */
export const ISBN_PATTERN = /^(\d{9}[\dX]|\d{13})$/;

/** An ISBN-10 or ISBN-13, hyphens/spaces allowed. */
export function isValidIsbn(raw: string): boolean {
  return ISBN_PATTERN.test(normalizeIsbn(raw));
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
// Exported so the app's inputs can stop at the same limits: one record over
// them would make the whole backup fail to import.
export const MAX_TEXT_LENGTH = 10_000;
export const MAX_TAG_LENGTH = 500;
// Library URLs are opened as links, so an imported file mustn't be able to
// plant a javascript: or other non-web URL.
export const WEB_URL = /^(https?:\/\/.*)?$/i;
const text = z.string().max(MAX_TEXT_LENGTH);
const tagList = z.array(z.string().max(MAX_TAG_LENGTH)).max(1_000);
const webUrl = z.string().max(2_000).regex(WEB_URL);

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
  isbn: z.string().regex(ISBN_PATTERN),
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

/** Open Library's work id form; a saved work's id becomes part of a storage key, so only this. */
export const OPEN_LIBRARY_WORK_ID = /^OL\d+W$/;

export const SavedWorkExportSchema = z.object({
  ...VersionedFields,
  deletedAt: z.number().int().nonnegative().optional(),
  openLibraryWorkId: z.string().regex(OPEN_LIBRARY_WORK_ID),
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

export const SavedListExportSchema = z.object({
  ...VersionedFields,
  deletedAt: z.number().int().nonnegative().optional(),
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  description: text,
  kind: z.enum(["book", "author"]),
  members: z
    .array(
      z.object({
        type: z.enum(["book", "work", "author"]),
        id: z.string().min(1).max(200),
        title: text,
        addedAt: z.number().int().nonnegative(),
      })
    )
    .max(MAX_IMPORT_RECORDS),
  createdAt: z.number().int().nonnegative(),
});

/**
 * A JSON backup file: the app's whole saved dataset (see the app's storage/snapshot.ts).
 * Version 1 files predate saved-work records, so they have no `works` and read as none;
 * from version 2 on `works` is required. Likewise `lists` (named lists) from version 3.
 * (A newer schemaVersion is the app's to reject.)
 */
export const SnapshotExportSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    items: z.array(SavedItemExportSchema).max(MAX_IMPORT_RECORDS),
    books: z.array(SavedBookExportSchema).max(MAX_IMPORT_RECORDS),
    works: z.array(SavedWorkExportSchema).max(MAX_IMPORT_RECORDS).optional(),
    libraries: z.array(LibraryExportSchema).max(MAX_IMPORT_RECORDS),
    lists: z.array(SavedListExportSchema).max(MAX_IMPORT_RECORDS).optional(),
  })
  .refine((s) => s.schemaVersion < 2 || s.works !== undefined, { message: "works is required from schemaVersion 2", path: ["works"] })
  .refine((s) => s.schemaVersion < 3 || s.lists !== undefined, { message: "lists is required from schemaVersion 3", path: ["lists"] })
  .transform(({ works = [], lists = [], ...rest }) => ({ ...rest, works, lists }));
export type SnapshotExport = z.infer<typeof SnapshotExportSchema>;

export const SeriesMemberSchema = z.object({
  wikidataId: z.string(),
  title: z.string(),
  position: z.string().nullable(),
  // Wikidata doesn't always know the Open Library id, so not every member is navigable.
  openLibraryWorkId: z.string().nullable(),
  coverUrl: z.string().nullable().default(null), // an older server omits it
});
export type SeriesMember = z.infer<typeof SeriesMemberSchema>;

export const SeriesSchema = z.object({
  wikidataId: z.string(),
  name: z.string(),
  members: z.array(SeriesMemberSchema),
});
export type Series = z.infer<typeof SeriesSchema>;

// Open Library frequently catalogs what's really the same book as several
// separate "work" records: a leading- or trailing-article variant ("The
// Cricket in Times Square" / "Cricket in Times Square" / "Old Meadow, The"),
// a differently-capitalized duplicate, or one edition's record carrying a
// series subtitle another edition's doesn't ("The Cricket in Times Square
// (Chester Cricket and His Friends)"). Stripping articles, trailing
// parentheticals, and punctuation collapses all of these onto the same key.
// This deliberately does NOT attempt to merge translations (e.g. "Grillo en
// Times Square", a Spanish edition of the same book) — their titles share
// no text to normalize toward, so any title-based heuristic that caught
// those would also risk merging genuinely different books that happen to
// share common words.
export function normalizeTitle(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const noSubtitle = base.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const noTrailingArticle = noSubtitle.replace(/,\s*(the|a|an)$/, "").trim();
  const noLeadingArticle = noTrailingArticle.replace(/^(the|a|an)\s+/, "");
  return noLeadingArticle.replace(/[^a-z0-9]+/g, " ").trim();
}
