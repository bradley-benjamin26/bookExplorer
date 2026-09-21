import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { getThemePreference, setThemePreference, type ThemePreference } from "./storage/themePreference";

export interface ThemeColors {
  background: string;
  // The outer margin area around the app's content on a wide window (a
  // maximized desktop browser, a large tablet) — visually distinct from
  // `background` so the content reads as a bounded page rather than
  // stretching edge to edge. Irrelevant on a phone-width screen, where the
  // content already fills the available width and this never shows.
  shellBackground: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  cardBorder: string;
  inputBorder: string;
  chipBackground: string;
  chipBackgroundAccent: string;
  chipBorderAccent: string;
  chipTextAccent: string;
  chipBackgroundGenre: string;
  chipTextGenre: string;
  // Matches `graphSubject` below — a subject tag on a book/work page and a
  // subject node in the graph explorer are the same concept, so they share
  // one color instead of the graph using one palette and detail pages
  // another.
  chipBackgroundSubject: string;
  chipTextSubject: string;
  // The highlighted background of a toggled-on pill button (e.g. "★ Saved").
  pillActiveBackground: string;
  link: string;
  primary: string;
  primaryText: string;
  danger: string;
  dangerBackground: string;
  warning: string;
  graphAuthor: string;
  graphWork: string;
  graphSubject: string;
  graphGenre: string;
}

const lightColors: ThemeColors = {
  background: "#ffffff",
  shellBackground: "#eef0f4",
  text: "#1a1a2e",
  textMuted: "#75758c",
  textFaint: "#9a9aab",
  border: "#eef0f2",
  cardBorder: "#e6e6ea",
  inputBorder: "#d8d8e0",
  chipBackground: "#f2f2f5",
  chipBackgroundAccent: "#eef2ff",
  chipBorderAccent: "#e0e6fb",
  chipTextAccent: "#3346a8",
  chipBackgroundGenre: "#fbeef7",
  chipTextGenre: "#9c3d82",
  chipBackgroundSubject: "#fbeee5",
  chipTextSubject: "#a8593c",
  pillActiveBackground: "#fdf0d0",
  link: "#1a4fba",
  primary: "#1a1a2e",
  primaryText: "#ffffff",
  danger: "#aa3333",
  dangerBackground: "#fdf0f0",
  warning: "#a87d00",
  graphAuthor: "#3346a8",
  graphWork: "#1a7a4c",
  graphSubject: "#a8593c",
  graphGenre: "#9c3d82",
};

// Not just an inverted light palette — brand colors tuned for dark
// backgrounds (confirmed by eye: the light palette's navy `primary` and
// saturated graph colors nearly disappear against a dark surface, so these
// are lightened/desaturated to hold the same contrast ratio instead of the
// same hex value).
const darkColors: ThemeColors = {
  background: "#17171f",
  shellBackground: "#0a0a0f",
  text: "#f1f1f6",
  textMuted: "#9797a8",
  textFaint: "#75758a",
  border: "#2a2a35",
  cardBorder: "#2e2e3a",
  inputBorder: "#3c3c48",
  chipBackground: "#232330",
  chipBackgroundAccent: "#212a4d",
  chipBorderAccent: "#2d3a66",
  chipTextAccent: "#a4b6f7",
  chipBackgroundGenre: "#3a2438",
  chipTextGenre: "#e7a6da",
  chipBackgroundSubject: "#3a2a20",
  chipTextSubject: "#e8946e",
  pillActiveBackground: "#4a3a12",
  link: "#8ab0ff",
  primary: "#5b6ee8",
  primaryText: "#ffffff",
  danger: "#ff8a8a",
  dangerBackground: "#3a2222",
  warning: "#e0ab52",
  graphAuthor: "#8fa4f2",
  graphWork: "#57d99a",
  graphSubject: "#e8946e",
  graphGenre: "#e7a6da",
};

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
