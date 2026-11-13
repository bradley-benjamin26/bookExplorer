import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** What web stores in place of a token: the server keeps the real one in an httpOnly cookie script can't read. */
export const WEB_COOKIE_SESSION = "cookie";

export function createSessionStore(key: string) {
  let token: string | null = null;
  let cleared: (() => void) | null = null;

  const store = () =>
    Platform.OS === "web"
      ? { get: () => AsyncStorage.getItem(key), set: (v: string) => AsyncStorage.setItem(key, v), del: () => AsyncStorage.removeItem(key) }
      : { get: () => SecureStore.getItemAsync(key), set: (v: string) => SecureStore.setItemAsync(key, v), del: () => SecureStore.deleteItemAsync(key) };

  return {
    async load(): Promise<void> {
      token = await store().get().catch(() => null);
      // A real token left by a build before the cookie: drop it, so that reader signs in once more.
      if (Platform.OS === "web" && token !== null && token !== WEB_COOKIE_SESSION) {
        token = null;
        await store().del().catch(() => {});
      }
    },
    get: (): string | null => token,
    async save(value: string): Promise<void> {
      token = Platform.OS === "web" ? WEB_COOKIE_SESSION : value;
      await store().set(token);
    },
    // The query client lives in _layout; it registers here so a 401 in api/client can drop cached data without an import cycle.
    onCleared(listener: () => void): () => void {
      cleared = listener;
      return () => {
        if (cleared === listener) cleared = null;
      };
    },
    async clear(): Promise<void> {
      token = null;
      cleared?.();
      await store().del();
    },
  };
}
