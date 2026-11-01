import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "hardcover-session";
let token: string | null = null;

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

export async function clearSession(): Promise<void> {
  token = null;
  await store().del();
}
