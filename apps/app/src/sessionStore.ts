import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export function createSessionStore(key: string) {
  let token: string | null = null;
  let cleared: (() => void) | null = null;

  // shortcut: web keeps the session token in localStorage (XSS-readable); it's our revocable session id, not the provider's token. Move to an httpOnly cookie if the web app ever loads third-party scripts
  const store = () =>
    Platform.OS === "web"
      ? { get: () => AsyncStorage.getItem(key), set: (v: string) => AsyncStorage.setItem(key, v), del: () => AsyncStorage.removeItem(key) }
      : { get: () => SecureStore.getItemAsync(key), set: (v: string) => SecureStore.setItemAsync(key, v), del: () => SecureStore.deleteItemAsync(key) };

  return {
    async load(): Promise<void> {
      token = await store().get().catch(() => null);
    },
    get: (): string | null => token,
    async save(value: string): Promise<void> {
      token = value;
      await store().set(value);
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
