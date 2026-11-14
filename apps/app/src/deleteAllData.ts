import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { disconnectHardcover, disconnectOpenLibrary } from "./api/client";
import { clearSession, getSessionToken } from "./hardcoverSession";
import { clearOpenLibrarySession, getOpenLibrarySessionToken } from "./openLibrarySession";

/** Erases everything Shelf Thread keeps for this person: server-held account keys, then all on-device data. */
export async function deleteAllData(queryClient: QueryClient): Promise<void> {
  // Server first: the session tokens are what tell it which stored keys to drop. Best effort, like the disconnect screens.
  await Promise.all([
    getSessionToken() && disconnectHardcover().catch(() => {}),
    getOpenLibrarySessionToken() && disconnectOpenLibrary().catch(() => {}),
  ]);
  await Promise.all([clearSession(), clearOpenLibrarySession()]);
  queryClient.clear();
  await AsyncStorage.clear();
}
