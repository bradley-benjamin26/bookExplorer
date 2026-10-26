import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { getThemePreference, setThemePreference, type ThemePreference } from "./storage/themePreference";
import { darkColors, lightColors, type ThemeColors } from "./themeColors";

export type { ThemeColors };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  pill: 16,
  full: 999,
} as const;

// Custom fonts select weight by family name, not `fontWeight` — pairing the
// two makes web browsers synthesize a faux-bold on top of the real weight.
export const fonts = {
  display: "Fraunces_600SemiBold",
  displayMedium: "Fraunces_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
} as const;

export const typeScale = {
  xs: 13,
  sm: 16,
  md: 20,
  lg: 25,
  xl: 31,
  xxl: 39,
} as const;

// The width the app's content is capped at on a wide window — chosen as a
// comfortable reading measure (similar to a paperback's line length), not
// the widest content could theoretically go. Beyond this, `shellBackground`
// shows on either side instead of text and touch targets stretching out to
// fill a monitor.
export const CONTENT_MAX_WIDTH = 720;

export interface Theme {
  colors: ThemeColors;
  scheme: "light" | "dark";
  spacing: typeof spacing;
  radii: typeof radii;
  fonts: typeof fonts;
  typeScale: typeof typeScale;
  /** A "kicker" label style — small, spaced-out capitals — used above every content section (About, Find This Book, Subjects, ...) so section boundaries read clearly without a divider line. */
  kicker: { fontSize: number; fontWeight: "700"; color: string; letterSpacing: number; textTransform: "uppercase" };
  /** A soft card treatment (book covers, elevated rows): a hairline border in both themes, plus a drop shadow that only reads clearly in light mode — a dark shadow is close to invisible against a dark surface, so dark mode leans on the border alone for definition. */
  cardStyle: {
    borderWidth: number;
    borderColor: string;
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
}

function buildTheme(scheme: "light" | "dark"): Theme {
  const colors = scheme === "dark" ? darkColors : lightColors;
  return {
    colors,
    scheme,
    spacing,
    radii,
    fonts,
    typeScale,
    kicker: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textMuted,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    cardStyle: {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: scheme === "dark" ? 0 : 0.08,
      shadowRadius: 6,
      elevation: scheme === "dark" ? 0 : 2,
    },
  };
}

const lightTheme = buildTheme("light");
const darkTheme = buildTheme("dark");

const ThemeContext = createContext<Theme>(lightTheme);

interface ThemePreferenceContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue>({
  preference: "system",
  setPreference: () => {},
});

/**
 * Defaults to following the OS/browser color scheme, but the "Standard" /
 * "Dark" toggle (see `useThemePreference`) can pin it to one mode regardless
 * of the OS setting. The choice is persisted so it survives a reload.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    getThemePreference().then(setPreferenceState);
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    setThemePreference(next);
  };

  const resolvedScheme = preference === "system" ? scheme : preference;
  const theme = resolvedScheme === "dark" ? darkTheme : lightTheme;

  return createElement(
    ThemePreferenceContext.Provider,
    { value: { preference, setPreference } },
    createElement(ThemeContext.Provider, { value: theme }, children)
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** The user's manual light/dark override ("system" follows the OS/browser setting). Drives the toggle on the Saved screen. */
export function useThemePreference(): ThemePreferenceContextValue {
  return useContext(ThemePreferenceContext);
}

/** Builds a StyleSheet from the current theme, memoized so it's only recomputed when the theme (i.e. the color scheme) actually changes. */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme]);
}
