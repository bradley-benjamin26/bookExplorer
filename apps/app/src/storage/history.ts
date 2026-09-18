import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "book-explorer:recent-isbns";
const MAX_HISTORY = 20;

export async function getRecentIsbns(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function addRecentIsbn(isbn: string): Promise<void> {
  const existing = await getRecentIsbns();
  const next = [isbn, ...existing.filter((i) => i !== isbn)].slice(0, MAX_HISTORY);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}
