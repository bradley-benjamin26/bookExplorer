import Constants from "expo-constants";
import { Platform } from "react-native";
import { z, type ZodType } from "zod";
import {
  AuthorSchema,
  BookSchema,
  GraphSchema,
  SubjectSchema,
  WorkRefSchema,
  WorkSchema,
  type Author,
  type Book,
  type Graph,
  type GraphNode,
  type Subject,
  type Work,
  type WorkRef,
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

// Sent as X-App-Key on every request once the server is deployed somewhere
// public (see apps/server's APP_SHARED_SECRET) — a shared secret between
// this app build and that server, not real per-user auth, meant only to
// filter out traffic that isn't coming from a real copy of the app.
// EXPO_PUBLIC_ vars are inlined at build time, so a production build sets
// this to match whatever the deployed server expects; left unset (as in
// local dev against a LAN server with no secret configured), no header is
// sent at all, matching the server's own "unset means skip the check".
const APP_SHARED_SECRET = process.env.EXPO_PUBLIC_APP_SHARED_SECRET;

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
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: APP_SHARED_SECRET ? { "X-App-Key": APP_SHARED_SECRET } : undefined,
  });
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

export function searchBooks(query: string): Promise<WorkRef[]> {
  return getJson(`/api/search?q=${encodeURIComponent(query)}`, z.array(WorkRefSchema));
}

// "genre" and "editions" are both GraphNode types (so they can be
// colored/labeled like any other node), but neither is a valid graph
// *center* — the server only knows how to build a graph rooted at an
// author, subject, or work (see routes/graph.ts's BUILDERS map), and the
// graph screen itself never centers on either (tapping one jumps straight
// to the Subject browse screen, or the work page's Editions section,
// instead). Excluding them here means a future caller passing one to
// fetchGraph is a compile error instead of a 400 discovered at runtime.
export type GraphCenterType = Exclude<GraphNode["type"], "genre" | "editions">;

export function fetchGraph(type: GraphCenterType, id: string): Promise<Graph> {
  return getJson(`/api/graph/${type}/${encodeURIComponent(id)}`, GraphSchema);
}
