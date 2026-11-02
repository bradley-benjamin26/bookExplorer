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
  chipBackgroundGenre: string;
  chipTextGenre: string;
  // Warm neutral, deliberately not `graphSubject`: detail-page tags use two hues (green genre, neutral subject).
  chipBackgroundSubject: string;
  chipTextSubject: string;
  // The highlighted background of a toggled-on pill button (e.g. "★ Saved").
  pillActiveBackground: string;
  // The 1px outline that makes a secondary pill read as a button (3:1 against paper and chip).
  pillBorder: string;
  // Primary buttons and the toggled-on pill.
  primary: string;
  primaryText: string;
  danger: string;
  dangerBackground: string;
  warning: string;
  graphAuthor: string;
  graphWork: string;
  graphSubject: string;
  graphGenre: string;
  graphAward: string;
  // Design-plan tokens (docs/DESIGN_PLAN.md). `cover` carries primary action;
  // `marginalia` is reserved for "this is yours" (saved) and graph highlights.
  paper: string;
  ink: string;
  inkFaint: string;
  cover: string;
  coverLight: string;
  marginalia: string;
  thread: string;
  // Tint behind a pressed / hovered list row.
  pressedBackground: string;
  hoverBackground: string;
}

export const lightColors: ThemeColors = {
  background: "#FAF7F0",
  shellBackground: "#EFEAE0",
  text: "#262320",
  // Darkened from #75758c/#767687 so muted text still clears WCAG AA 4.5:1 on the warmer paper background.
  textMuted: "#6B655A",
  textFaint: "#665F55",
  border: "#EEE8DA",
  cardBorder: "#E6DFD0",
  inputBorder: "#857D6E",
  chipBackground: "#F1EBDD",
  chipBackgroundGenre: "#E4ECE7",
  chipTextGenre: "#2B5951",
  chipBackgroundSubject: "#F1EBDD",
  chipTextSubject: "#262320",
  pillActiveBackground: "#fdf0d0",
  pillBorder: "#8C877B",
  primary: "#2B5951",
  primaryText: "#FFFFFF",
  danger: "#aa3333",
  dangerBackground: "#fdf0f0",
  warning: "#8a6600",
  graphAuthor: "#3346a8",
  graphWork: "#1a7a4c",
  graphSubject: "#a8593c",
  graphGenre: "#9c3d82",
  graphAward: "#8a6d1f",
  paper: "#FAF7F0",
  ink: "#262320",
  // The plan's #8B8A94 / #C0572E are 3.2:1 / 4.2:1 on paper; nudged darker to pass AA as text.
  inkFaint: "#5F594F",
  cover: "#2B5951",
  coverLight: "#E4ECE7",
  marginalia: "#A85026",
  thread: "#8A94A8",
  pressedBackground: "#EFE8D8",
  hoverBackground: "#F5F0E4",
};

// Not just an inverted light palette — brand colors tuned for dark
// backgrounds (confirmed by eye: the light palette's navy `primary` and
// saturated graph colors nearly disappear against a dark surface, so these
// are lightened/desaturated to hold the same contrast ratio instead of the
// same hex value).
export const darkColors: ThemeColors = {
  background: "#1C1B18",
  shellBackground: "#121110",
  text: "#EDEAE2",
  textMuted: "#A39E92",
  textFaint: "#9A9588",
  border: "#2B2924",
  cardBorder: "#34312B",
  inputBorder: "#7A766B",
  chipBackground: "#26241F",
  chipBackgroundGenre: "#23332F",
  chipTextGenre: "#6FA897",
  chipBackgroundSubject: "#26241F",
  chipTextSubject: "#EDEAE2",
  pillActiveBackground: "#4a3a12",
  // The plan's #6B6B7B is 2.96:1 on chipBackground; nudged lighter to clear 3:1.
  pillBorder: "#77736A",
  primary: "#3A7F70",
  primaryText: "#FFFFFF",
  danger: "#ff8a8a",
  dangerBackground: "#3a2222",
  warning: "#e0ab52",
  graphAuthor: "#8fa4f2",
  graphWork: "#57d99a",
  graphSubject: "#e8946e",
  graphGenre: "#e7a6da",
  graphAward: "#e0c27a",
  paper: "#1C1B18",
  ink: "#EDEAE2",
  inkFaint: "#A29D90",
  cover: "#6FA897",
  coverLight: "#23332F",
  marginalia: "#E08662",
  thread: "#8A94A8",
  pressedBackground: "#2C2A25",
  hoverBackground: "#23211D",
};
