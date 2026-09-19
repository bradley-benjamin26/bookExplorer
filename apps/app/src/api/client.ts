import Constants from "expo-constants";
import { Platform } from "react-native";
import type { ZodType } from "zod";
import {
  AuthorSchema,
  BookSchema,
  GraphSchema,
  SubjectSchema,
  WorkSchema,
  type Author,
  type Book,
  type Graph,
  type GraphNode,
  type Subject,
  type Work,
} from "@book-explorer/shared";

function resolveApiBaseUrl(): string {
  if (Platform.OS === "web") return "http://localhost:3001";

  // On a physical device / simulator, reuse the LAN host that Metro is already
  // running on (Constants exposes it as hostUri, e.g. "192.168.1.5:8081").
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(":")[0];
  return host ? `http://${host}:3001` : "http://localhost:3001";
}

export const API_BASE_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Parses every response against the shared zod schema instead of just type-
// asserting it. The schemas already existed for the server's own use, but
// nothing was actually running them against what came back over the wire —
// a malformed or unexpectedly-shaped response would previously pass through
// silently and surface later as a confusing render-time bug (or not at all,
// if the missing field just happened to render as blank).
async function getJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? `Request failed: ${path}`, res.status);
  }
  const json = await res.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(`Unexpected response shape from ${path}: ${result.error.message}`, res.status);
  }
  return result.data;
}

export function fetchBookByIsbn(isbn: string): Promise<Book> {
  return getJson(`/api/books/isbn/${encodeURIComponent(isbn)}`, BookSchema);
}

export function fetchAuthor(openLibraryId: string): Promise<Author> {
  return getJson(`/api/authors/${encodeURIComponent(openLibraryId)}`, AuthorSchema);
}

export function fetchSubject(slug: string): Promise<Subject> {
  return getJson(`/api/subjects/${encodeURIComponent(slug)}`, SubjectSchema);
}

export function fetchWork(workId: string): Promise<Work> {
  return getJson(`/api/works/${encodeURIComponent(workId)}`, WorkSchema);
}

export function fetchGraph(type: GraphNode["type"], id: string): Promise<Graph> {
  return getJson(`/api/graph/${type}/${encodeURIComponent(id)}`, GraphSchema);
}
