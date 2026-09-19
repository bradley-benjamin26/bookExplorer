import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Author, Book, Subject, Work } from "@book-explorer/shared";

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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? `Request failed: ${path}`, res.status);
  }
  return res.json();
}

export function fetchBookByIsbn(isbn: string): Promise<Book> {
  return getJson<Book>(`/api/books/isbn/${encodeURIComponent(isbn)}`);
}

export function fetchAuthor(openLibraryId: string): Promise<Author> {
  return getJson<Author>(`/api/authors/${encodeURIComponent(openLibraryId)}`);
}

export function fetchSubject(slug: string): Promise<Subject> {
  return getJson<Subject>(`/api/subjects/${encodeURIComponent(slug)}`);
}

export function fetchWork(workId: string): Promise<Work> {
  return getJson<Work>(`/api/works/${encodeURIComponent(workId)}`);
}
