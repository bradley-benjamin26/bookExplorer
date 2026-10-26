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
  // Design-plan tokens (docs/DESIGN_PLAN.md). `cover` carries primary action;
  // `marginalia` is reserved for "this is yours" (saved) and graph highlights.
  paper: string;
  ink: string;
  inkFaint: string;
  cover: string;
  coverLight: string;
  marginalia: string;
  thread: string;
}

const lightColors: ThemeColors = {
  background: "#FAF7F0",
  shellBackground: "#EFEBE2",
  text: "#1F2430",
  // Darkened from #75758c/#767687 so muted text still clears WCAG AA 4.5:1 on the warmer paper background.
  textMuted: "#6b6b80",
  textFaint: "#6c6c7d",
  border: "#eef0f2",
  cardBorder: "#e6e6ea",
  inputBorder: "#85859a",
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
  warning: "#8a6600",
  graphAuthor: "#3346a8",
  graphWork: "#1a7a4c",
  graphSubject: "#a8593c",
  graphGenre: "#9c3d82",
  paper: "#FAF7F0",
  ink: "#1F2430",
  // The plan's #8B8A94 / #C0572E are 3.2:1 / 4.2:1 on paper; nudged darker to pass AA as text.
  inkFaint: "#6E6D78",
  cover: "#2B5951",
  coverLight: "#E4ECE7",
  marginalia: "#A85026",
  thread: "#8A94A8",
};

// Not just an inverted light palette — brand colors tuned for dark
// backgrounds (confirmed by eye: the light palette's navy `primary` and
// saturated graph colors nearly disappear against a dark surface, so these
// are lightened/desaturated to hold the same contrast ratio instead of the
// same hex value).
const darkColors: ThemeColors = {
  background: "#191B20",
  shellBackground: "#0a0a0f",
  text: "#EDEAE2",
  textMuted: "#9797a8",
  textFaint: "#8c8ca0",
  border: "#2a2a35",
  cardBorder: "#2e2e3a",
  inputBorder: "#707082",
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
  paper: "#191B20",
  ink: "#EDEAE2",
  inkFaint: "#9C9AA6",
  cover: "#6FA897",
  coverLight: "#23332F",
  marginalia: "#E08662",
  thread: "#8A94A8",
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
