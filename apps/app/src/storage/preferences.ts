import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedList } from "./savedLists";
import { enqueueWrite } from "./writeQueue";

// Per-device, like theme and search filters, so deliberately not part of the library snapshot.
const PREFERENCES_KEY = "book-explorer:preferences";

export interface Preferences {
  recordHistory: boolean;
  startInBatchScan: boolean;
  scanHaptics: boolean;
  /** The list a save with no list picked lands on; null (or a deleted list) means the "Saved …" list. */
  defaultListIds: Record<SavedList["kind"], string | null>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  recordHistory: true,
  startInBatchScan: false,
  scanHaptics: true,
  defaultListIds: { book: null, author: null },
};

export async function getPreferences(): Promise<Preferences> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(PREFERENCES_KEY)) ?? "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFERENCES;
    const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
    const id = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      recordHistory: bool(parsed.recordHistory, DEFAULT_PREFERENCES.recordHistory),
      startInBatchScan: bool(parsed.startInBatchScan, DEFAULT_PREFERENCES.startInBatchScan),
      scanHaptics: bool(parsed.scanHaptics, DEFAULT_PREFERENCES.scanHaptics),
      defaultListIds: { book: id(parsed.defaultListIds?.book), author: id(parsed.defaultListIds?.author) },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Merges `change` into the stored preferences and returns the result. */
export function setPreferences(change: Partial<Preferences>): Promise<Preferences> {
  return enqueueWrite(PREFERENCES_KEY, async () => {
    const next = { ...(await getPreferences()), ...change };
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    return next;
  });
}
