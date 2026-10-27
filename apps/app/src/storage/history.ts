import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";
import { routes } from "../navigation";
import { enqueueWrite } from "./writeQueue";

// The key predates works/authors/subjects; kept so old entries migrate in place.
const HISTORY_KEY = "book-explorer:recent-isbns";
const MAX_HISTORY = 30;

export type RecentKind = "book" | "work" | "author" | "subject";

export interface RecentItem {
  kind: RecentKind;
  id: string;
  title: string | null;
  /** The authors, for books and works. */
  subtitle: string | null;
}

interface LegacyRecentBook {
  isbn: string;
  title: string | null;
  authorNames: string[];
}

export async function getRecent(): Promise<RecentItem[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    // Older versions stored bare ISBN strings, then { isbn, title, authorNames }; both read as books.
    return (JSON.parse(raw) as (string | LegacyRecentBook | RecentItem)[]).map((e) => {
      if (typeof e === "string") return { kind: "book", id: e, title: null, subtitle: null };
      if ("kind" in e) return e;
      return { kind: "book", id: e.isbn, title: e.title, subtitle: e.authorNames?.length ? e.authorNames.join(", ") : null };
    });
  } catch {
    return [];
  }
}

export function addRecent(item: RecentItem): Promise<void> {
  return enqueueWrite(HISTORY_KEY, async () => {
    const existing = await getRecent();
    const next = [item, ...existing.filter((r) => r.kind !== item.kind || r.id !== item.id)].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  });
}

/** "books" means books and works. */
export function recentOfKind(items: RecentItem[], filter: "all" | "books" | "authors" | "subjects"): RecentItem[] {
  if (filter === "all") return items;
  const kinds: RecentKind[] = filter === "books" ? ["book", "work"] : [filter === "authors" ? "author" : "subject"];
  return items.filter((r) => kinds.includes(r.kind));
}

export function recentHref(item: RecentItem): Href {
  return routes[item.kind](item.id);
}
