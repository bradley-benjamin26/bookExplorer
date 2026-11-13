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
  // Genre and subject chips carry the graph's genre and subject hues (darkened for text contrast),
  // so a tag on a detail page and its node on the graph read as the same kind of thing.
  chipBackgroundGenre: string;
  chipTextGenre: string;
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
  // Raised surface (list rows, modal) one step lighter than paper.
  card: string;
  ink: string;
  inkFaint: string;
  cover: string;
  coverLight: string;
  marginalia: string;
  thread: string;
  // Keyboard focus ring; passes 3:1 on paper and card; drawn with an outline offset so it never sits on a primary button.
  focus: string;
  emptyBackground: string;
  // Tint behind a pressed / hovered list row.
  pressedBackground: string;
  hoverBackground: string;
}

export const lightColors: ThemeColors = {
  background: "#EDF3E8",
  shellBackground: "#E3EADF",
  text: "#202B25",
  // Darkened from #75758c/#767687 so muted text still clears WCAG AA 4.5:1 on the warmer paper background.
  textMuted: "#4C5C50",
  textFaint: "#4C5C50",
  border: "#C9D5C7",
  cardBorder: "#B6C8B7",
  inputBorder: "#718477",
  chipBackground: "#E2EBE0",
  chipBackgroundGenre: "#EADFEE",
  chipTextGenre: "#6A3F75",
  chipBackgroundSubject: "#DDE8D9",
  chipTextSubject: "#3F5A3C",
  pillActiveBackground: "#DCE7DA",
  pillBorder: "#718477",
  primary: "#B94E25",
  primaryText: "#FFFFFF",
  danger: "#A33232",
  dangerBackground: "#F7E6E3",
  warning: "#7A5A00",
  graphAuthor: "#375663",
  graphWork: "#963B1B",
  graphSubject: "#506D4D",
  graphGenre: "#7A4A86",
  graphAward: "#7A5F12",
  paper: "#EDF3E8",
  card: "#F8FAF4",
  ink: "#202B25",
  // The plan's #8B8A94 / #C0572E are 3.2:1 / 4.2:1 on paper; nudged darker to pass AA as text.
  inkFaint: "#4C5C50",
  cover: "#A84623",
  coverLight: "#E4EDE1",
  marginalia: "#375663",
  focus: "#244E76",
  thread: "#6A8071",
  emptyBackground: "#E4EDE1",
  pressedBackground: "#DCE7DA",
  hoverBackground: "#E4EDE1",
};

// Not just an inverted light palette — brand colors tuned for dark
// backgrounds (confirmed by eye: the light palette's navy `primary` and
// saturated graph colors nearly disappear against a dark surface, so these
// are lightened/desaturated to hold the same contrast ratio instead of the
// same hex value).
export const darkColors: ThemeColors = {
  background: "#161D19",
  shellBackground: "#0F1411",
  text: "#E6EDE4",
  textMuted: "#A9B7AC",
  textFaint: "#A9B7AC",
  border: "#2A352E",
  cardBorder: "#34423A",
  inputBorder: "#7F9385",
  chipBackground: "#222B26",
  chipBackgroundGenre: "#2E2336",
  chipTextGenre: "#D9B3E6",
  chipBackgroundSubject: "#233226",
  chipTextSubject: "#A9D0A4",
  pillActiveBackground: "#4B7A8C",
  // The plan's #6B6B7B is 2.96:1 on chipBackground; nudged lighter to clear 3:1.
  pillBorder: "#7F9385",
  primary: "#B94E25",
  primaryText: "#FFFFFF",
  danger: "#FF9A9A",
  dangerBackground: "#3A2222",
  warning: "#E0AB52",
  graphAuthor: "#8FB4C4",
  graphWork: "#E58A63",
  graphSubject: "#9FC49A",
  graphGenre: "#D3A6E0",
  graphAward: "#D9BC6A",
  paper: "#161D19",
  card: "#1E2722",
  ink: "#E6EDE4",
  inkFaint: "#A9B7AC",
  cover: "#E58A63",
  coverLight: "#25302A",
  marginalia: "#8FB4C4",
  focus: "#8FB4C4",
  thread: "#6F8575",
  emptyBackground: "#1E2722",
  pressedBackground: "#2A352E",
  hoverBackground: "#1E2722",
};
