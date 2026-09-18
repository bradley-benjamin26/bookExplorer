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

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["book", "author", "subject"]),
  label: z.string(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
export type Graph = z.infer<typeof GraphSchema>;
