// Kept free of react-native imports so plain node tests can read the palettes.
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

export const lightColors: ThemeColors = {
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
export const darkColors: ThemeColors = {
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
