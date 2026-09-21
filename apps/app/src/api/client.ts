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
  // Escape hatch for whenever the LAN-guessing below doesn't apply — Expo
  // tunnel mode (`expo start --tunnel`) replaces Metro's host with a tunnel
  // domain that has nothing listening on port 3001, and some networks block
  // device-to-device LAN traffic outright (school/corporate Wi-Fi, some
  // routers' client isolation). Set this to a reachable backend URL (e.g. an
  // `ngrok http 3001` URL) to bypass LAN detection entirely. EXPO_PUBLIC_
  // env vars are inlined at build time by Expo — no extra config needed.
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;

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
    // Routes that deliberately return 404 set `error` to a specific message
    // ("No author found for id ..."). An unhandled exception instead gets
    // Fastify's default shape, where `error` is just the generic HTTP status
    // text ("Internal Server Error") and `message` holds the actual reason
    // — preferring `message` when present surfaces that real reason instead
    // of a message that reads the same whether Wikidata timed out or the
    // author genuinely doesn't exist.
    throw new ApiError(body.message ?? body.error ?? `Request failed: ${path}`, res.status);
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
