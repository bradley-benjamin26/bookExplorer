import AsyncStorage from "@react-native-async-storage/async-storage";
import { enqueueWrite } from "./writeQueue";

const HISTORY_KEY = "book-explorer:recent-isbns";
const MAX_HISTORY = 20;

export interface RecentBook {
  isbn: string;
  title: string | null;
  authorNames: string[];
}

export async function getRecentBooks(): Promise<RecentBook[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    // Older versions stored bare ISBN strings; normalize them to untitled entries.
    return (JSON.parse(raw) as (string | RecentBook)[]).map((e) =>
      typeof e === "string" ? { isbn: e, title: null, authorNames: [] } : e
    );
  } catch {
    return [];
  }
}

export function addRecentBook(book: RecentBook): Promise<void> {
  return enqueueWrite(HISTORY_KEY, async () => {
    const existing = await getRecentBooks();
    const next = [book, ...existing.filter((b) => b.isbn !== book.isbn)].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  });
}
