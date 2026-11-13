import Constants from "expo-constants";
import { Platform } from "react-native";
import { z, type ZodType, type ZodTypeDef } from "zod";
import { clearSession, getSessionToken } from "../hardcoverSession";
import { clearOpenLibrarySession, getOpenLibrarySessionToken } from "../openLibrarySession";
import {
  AwardSchema,
  AuthorRefSchema,
  AuthorSchema,
  BookSchema,
  GraphSchema,
  HardcoverAccountSchema,
  HardcoverHandoffSchema,
  HardcoverListBooksSchema,
  HardcoverListSummarySchema,
  HardcoverProgressSchema,
  LibraryAvailabilitySchema,
  OpenLibraryAccountSchema,
  OpenLibraryAddResultSchema,
  OpenLibraryListSchema,
  OpenLibraryListSummarySchema,
  OpenLibrarySessionSchema,
  PathResultSchema,
  SeriesSchema,
  SubjectSchema,
  SupportedLibrarySchema,
  WorkRefSchema,
  WorkSchema,
  type Author,
  type Award,
  type AuthorRef,
  type Book,
  type Graph,
  type Series,
  type GraphNode,
  type LibraryAvailability,
  type OpenLibraryAddResult,
  type OpenLibraryMember,
  type PathResult,
  type Subject,
  type SupportedLibrary,
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

  // A release build has no Metro host to guess from; failing here beats shipping a build that calls localhost.
  if (process.env.NODE_ENV === "production") throw new Error("EXPO_PUBLIC_API_BASE_URL must be set for production builds");

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
  constructor(message: string, public status: number, public retryAfterSeconds?: number) {
    super(message);
  }
}

function headers(extra?: Record<string, string>): Record<string, string> | undefined {
  const h: Record<string, string> = { ...extra };
  if (APP_SHARED_SECRET) h["X-App-Key"] = APP_SHARED_SECRET;
  // Web sends its sessions as httpOnly cookies instead (see request).
  if (Platform.OS !== "web") {
    const session = getSessionToken();
    if (session) h["X-Hardcover-Session"] = session;
    const olSession = getOpenLibrarySessionToken();
    if (olSession) h["X-OpenLibrary-Session"] = olSession;
  }
  return Object.keys(h).length ? h : undefined;
}

async function request<T>(path: string, init: RequestInit, schema?: ZodType<T, ZodTypeDef, unknown>): Promise<T | undefined> {
  const res = await fetch(`${API_BASE_URL}${path}`, Platform.OS === "web" ? { ...init, credentials: "include" } : init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    // A rejected session is dead; drop it so the app reads as signed out.
    if (res.status === 401 && path.startsWith("/api/hardcover/")) await clearSession();
    if (res.status === 401 && path.startsWith("/api/openlibrary/")) await clearOpenLibrarySession();
    // Routes that deliberately return 404 set `error` to a specific message
    // ("No author found for id ..."). An unhandled exception instead gets
    // Fastify's default shape, where `error` is just the generic HTTP status
    // text ("Internal Server Error") and `message` holds the actual reason
    // — preferring `message` when present surfaces that real reason instead
    // of a message that reads the same whether Wikidata timed out or the
    // author genuinely doesn't exist.
    const retryAfter = body.retryAfterSeconds ?? (Number(res.headers.get("Retry-After")) || undefined);
    throw new ApiError(body.message ?? body.error ?? `Request failed: ${path}`, res.status, res.status === 429 ? retryAfter : undefined);
  }
  if (!schema) return undefined;
  const json = await res.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(`Unexpected response shape from ${path}: ${result.error.message}`, res.status);
  }
  return result.data;
}

// Parses every response against the shared zod schema instead of just type-
// asserting it, so a malformed response fails loudly here instead of as a confusing render-time bug.
// `signal` is React Query's, so leaving a screen cancels its in-flight request.
async function getJson<T>(path: string, schema: ZodType<T, ZodTypeDef, unknown>, signal?: AbortSignal): Promise<T> {
  return (await request(path, { headers: headers(), signal }, schema)) as T;
}

export function sendJson<T>(method: "POST" | "DELETE", path: string, body: unknown, schema?: ZodType<T, ZodTypeDef, unknown>): Promise<T | undefined> {
  return request(path, { method, headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) }, schema);
}

export async function redeemHardcoverHandoff(handoff: string): Promise<{ token: string; username: string }> {
  return (await sendJson("POST", "/api/hardcover/session", { handoff, cookie: Platform.OS === "web" }, HardcoverHandoffSchema))!;
}

export function fetchHardcoverAccount(): Promise<{ username: string }> {
  return getJson("/api/hardcover/session", HardcoverAccountSchema);
}

export async function disconnectHardcover(): Promise<void> {
  await sendJson("DELETE", "/api/hardcover/session", {});
}

export function fetchHardcoverLists() {
  return getJson("/api/hardcover/lists", z.array(HardcoverListSummarySchema));
}

export function fetchHardcoverList(id: number) {
  return getJson(`/api/hardcover/lists/${id}`, HardcoverListBooksSchema);
}

export async function createHardcoverList(input: { name: string; description: string }): Promise<{ id: number }> {
  return (await sendJson("POST", "/api/hardcover/lists", input, z.object({ id: z.number() })))!;
}

export async function addHardcoverListBook(listId: number, member: { type: "book" | "work"; id: string }): Promise<{ hardcoverBookId: number }> {
  return (await sendJson("POST", `/api/hardcover/lists/${listId}/books`, member, z.object({ hardcoverBookId: z.number() })))!;
}

export async function removeHardcoverListBook(listId: number, bookId: number): Promise<void> {
  await sendJson("DELETE", `/api/hardcover/lists/${listId}/books/${bookId}`, {});
}

export function fetchHardcoverProgress(type: "book" | "work", id: string) {
  return getJson(`/api/hardcover/progress/${type}/${encodeURIComponent(id)}`, HardcoverProgressSchema);
}

export function fetchSupportedLibraries(): Promise<SupportedLibrary[]> {
  return getJson("/api/libraries", z.array(SupportedLibrarySchema));
}

export function fetchLibraryAvailability(libraryId: string, isbn: string, signal?: AbortSignal): Promise<LibraryAvailability> {
  return getJson(`/api/libraries/${encodeURIComponent(libraryId)}/availability?${new URLSearchParams({ isbn })}`, LibraryAvailabilitySchema, signal);
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

export function fetchAward(slug: string, label?: string): Promise<Award> {
  return getJson(`/api/awards/${encodeURIComponent(slug)}${label ? `?label=${encodeURIComponent(label)}` : ""}`, AwardSchema);
}

export function fetchWork(workId: string): Promise<Work> {
  return getJson(`/api/works/${encodeURIComponent(workId)}`, WorkSchema);
}

export function searchBooks(params: Record<string, string>): Promise<WorkRef[]> {
  return getJson(`/api/search?${new URLSearchParams(params)}`, z.array(WorkRefSchema));
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

export function fetchGraph(type: GraphCenterType, id: string, extra = 0): Promise<Graph> {
  return getJson(`/api/graph/${type}/${encodeURIComponent(id)}${extra ? `?extra=${extra}` : ""}`, GraphSchema);
}

export function fetchSeries(qid: string): Promise<Series> {
  return getJson(`/api/series/${encodeURIComponent(qid)}`, SeriesSchema);
}

/** Up to three chains, most specific first, between two graph node ids ("work:OL1W", "author:OL2A", ...). */
export function fetchPath(from: string, to: string, signal?: AbortSignal): Promise<PathResult> {
  return getJson(`/api/path?${new URLSearchParams({ from, to })}`, PathResultSchema, signal);
}

/** LCSH subject or LC genre headings matching what's being typed (at most 8). */
export function suggestTerms(kind: "subjects" | "genres", q: string, signal?: AbortSignal): Promise<string[]> {
  return getJson(`/api/suggest/${kind}?${new URLSearchParams({ q })}`, z.array(z.string()), signal);
}

/** Authors matching a name being typed (at most 5). */
export function searchAuthors(q: string): Promise<AuthorRef[]> {
  return getJson(`/api/search/authors?${new URLSearchParams({ q })}`, z.array(AuthorRefSchema));
}

export async function connectOpenLibrary(access: string, secret: string): Promise<{ token: string; username: string }> {
  return (await sendJson("POST", "/api/openlibrary/session", { access, secret, cookie: Platform.OS === "web" }, OpenLibrarySessionSchema))!;
}

export function fetchOpenLibraryAccount(): Promise<{ username: string }> {
  return getJson("/api/openlibrary/session", OpenLibraryAccountSchema);
}

export async function disconnectOpenLibrary(): Promise<void> {
  await sendJson("DELETE", "/api/openlibrary/session", {});
}

export function fetchOpenLibraryLists() {
  return getJson("/api/openlibrary/lists", z.array(OpenLibraryListSummarySchema));
}

export function fetchOpenLibraryList(id: string) {
  return getJson(`/api/openlibrary/lists/${encodeURIComponent(id)}`, OpenLibraryListSchema);
}

export async function createOpenLibraryList(input: { name: string; description: string }): Promise<{ id: string }> {
  return (await sendJson("POST", "/api/openlibrary/lists", input, z.object({ id: z.string() })))!;
}

export async function addOpenLibraryMembers(listId: string, members: OpenLibraryMember[]): Promise<OpenLibraryAddResult> {
  return (await sendJson("POST", `/api/openlibrary/lists/${encodeURIComponent(listId)}/seeds`, { members }, OpenLibraryAddResultSchema))!;
}

export async function removeOpenLibrarySeed(listId: string, seed: string): Promise<void> {
  await sendJson("DELETE", `/api/openlibrary/lists/${encodeURIComponent(listId)}/seeds?seed=${encodeURIComponent(seed)}`, {});
}
