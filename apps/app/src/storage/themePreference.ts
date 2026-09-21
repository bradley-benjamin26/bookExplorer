import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_PREFERENCE_KEY = "book-explorer:theme-preference";

export type ThemePreference = "system" | "light" | "dark";

const VALID_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export async function getThemePreference(): Promise<ThemePreference> {
  const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return VALID_PREFERENCES.includes(stored as ThemePreference) ? (stored as ThemePreference) : "system";
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
}
