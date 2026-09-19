import { z } from "zod";

export const AuthorRefSchema = z.object({
  openLibraryId: z.string(),
  name: z.string(),
});
export type AuthorRef = z.infer<typeof AuthorRefSchema>;

export const BookSchema = z.object({
  isbn: z.string(),
  title: z.string(),
  authors: z.array(AuthorRefSchema),
  subjects: z.array(z.string()),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  openLibraryWorkId: z.string().nullable(),
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
  birthDate: z.string().nullable(),
  deathDate: z.string().nullable(),
  relations: z.array(AuthorRelationSchema),
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

export const WorkSchema = WorkRefSchema.extend({
  description: z.string().nullable(),
  subjects: z.array(z.string()),
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
  type: z.enum(["author", "work", "subject"]),
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
