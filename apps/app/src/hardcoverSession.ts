import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "hardcover-session";
let token: string | null = null;
let cleared: (() => void) | null = null;

// shortcut: web keeps the session token in localStorage (XSS-readable); it's our revocable session id, not the Hardcover token. Move to an httpOnly cookie if the web app ever loads third-party scripts
const store = () =>
  Platform.OS === "web"
    ? { get: () => AsyncStorage.getItem(KEY), set: (v: string) => AsyncStorage.setItem(KEY, v), del: () => AsyncStorage.removeItem(KEY) }
    : { get: () => SecureStore.getItemAsync(KEY), set: (v: string) => SecureStore.setItemAsync(KEY, v), del: () => SecureStore.deleteItemAsync(KEY) };

export async function loadSession(): Promise<void> {
  token = await store().get().catch(() => null);
}

export const getSessionToken = (): string | null => token;

export async function saveSession(value: string): Promise<void> {
  token = value;
  await store().set(value);
}

// The query client lives in _layout; it registers here so a 401 in api/client can drop cached Hardcover data without an import cycle.
export function onSessionCleared(listener: () => void): () => void {
  cleared = listener;
  return () => {
    if (cleared === listener) cleared = null;
  };
}

export async function clearSession(): Promise<void> {
  token = null;
  cleared?.();
  await store().del();
}
