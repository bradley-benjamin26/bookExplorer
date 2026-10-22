import AsyncStorage from "@react-native-async-storage/async-storage";

// Per-device, so deliberately not part of the library snapshot.
const SEARCH_FILTERS_KEY = "book-explorer:search-filters";

export type SearchMode = "title" | "author" | "subject";

export interface SearchFilterChoice {
  mode: SearchMode;
  yearFrom: string;
  yearTo: string;
  language: string;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilterChoice = { mode: "title", yearFrom: "", yearTo: "", language: "" };

const MODES: SearchMode[] = ["title", "author", "subject"];

export async function getSearchFilters(): Promise<SearchFilterChoice> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(SEARCH_FILTERS_KEY)) ?? "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_SEARCH_FILTERS;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      mode: MODES.includes(parsed.mode) ? parsed.mode : "title",
      yearFrom: str(parsed.yearFrom),
      yearTo: str(parsed.yearTo),
      language: str(parsed.language),
    };
  } catch {
    return DEFAULT_SEARCH_FILTERS;
  }
}

export async function setSearchFilters(choice: SearchFilterChoice): Promise<void> {
  await AsyncStorage.setItem(SEARCH_FILTERS_KEY, JSON.stringify(choice));
}

/** Turns the UI choice + typed text into /api/search params, dropping values the server would 400 on. */
export function toSearchParams(text: string, f: SearchFilterChoice): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.mode === "title") params.q = text;
  else params[f.mode] = text;
  if (/^\d{4}$/.test(f.yearFrom)) params.yearFrom = f.yearFrom;
  if (/^\d{4}$/.test(f.yearTo)) params.yearTo = f.yearTo;
  if (/^[a-z]{3}$/.test(f.language.toLowerCase())) params.language = f.language.toLowerCase();
  return params;
}
