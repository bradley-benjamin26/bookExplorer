import { describe, expect, it, vi } from "vitest";
import { darkColors, lightColors } from "./themeColors";

vi.mock("react-native", () => ({ useColorScheme: () => "light" }));
vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));

const { radii, typeScale } =await import("./theme");

// WCAG 2.x relative luminance / contrast ratio for "#RRGGBB" colours.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("contrast helper", () => {
  it("matches known ratios", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
])("%s theme contrast", (_name, c) => {
  it.each([
    ["primaryText on primary", c.primaryText, c.primary, 4.5],
    ["primary vs paper", c.primary, c.paper, 3],
    ["pillBorder vs paper", c.pillBorder, c.paper, 3],
    ["pillBorder vs chipBackground", c.pillBorder, c.chipBackground, 3],
    ["inkFaint on paper", c.inkFaint, c.paper, 5.5],
    ["ink on paper", c.ink, c.paper, 4.5],
    ["cover on paper", c.cover, c.paper, 4.5],
    ["danger on paper", c.danger, c.paper, 4.5],
    ["chipTextSubject on chipBackgroundSubject", c.chipTextSubject, c.chipBackgroundSubject, 4.5],
    ["inputBorder vs background", c.inputBorder, c.background, 3],
    ["textFaint on background", c.textFaint, c.background, 4.5],
    ["warning on background", c.warning, c.background, 4.5],
    ["graphAward on paper", c.graphAward, c.paper, 4.5],
    ["textMuted on paper", c.textMuted, c.paper, 4.5],
    ["ink on pressedBackground", c.ink, c.pressedBackground, 4.5],
    ["ink on hoverBackground", c.ink, c.hoverBackground, 4.5],
    ["inkFaint on chipBackground", c.inkFaint, c.chipBackground, 4.5],
    ["chipTextGenre on chipBackgroundGenre", c.chipTextGenre, c.chipBackgroundGenre, 4.5],
    ["ink on card", c.ink, c.card, 4.5],
    ["textMuted on card", c.textMuted, c.card, 4.5],
    ["cover on card", c.cover, c.card, 4.5],
    ["thread vs paper", c.thread, c.paper, 2],
    ["ink on emptyBackground", c.ink, c.emptyBackground, 4.5],
    ["inkFaint on emptyBackground", c.inkFaint, c.emptyBackground, 4.5],
    ["focus vs paper", c.focus, c.paper, 3],
    ["focus vs card", c.focus, c.card, 3],
    ["graphWork vs paper", c.graphWork, c.paper, 3],
    ["graphWork vs card", c.graphWork, c.card, 3],
    ["graphAuthor vs paper", c.graphAuthor, c.paper, 3],
    ["graphAuthor vs card", c.graphAuthor, c.card, 3],
    ["graphSubject vs paper", c.graphSubject, c.paper, 3],
    ["graphSubject vs card", c.graphSubject, c.card, 3],
    ["graphGenre vs paper", c.graphGenre, c.paper, 3],
    ["graphGenre vs card", c.graphGenre, c.card, 3],
    ["marginalia on paper", c.marginalia, c.paper, 4.5],
    ["selected text on pillActiveBackground", c.primaryText, c.pillActiveBackground, 4.5],
  ])("%s", (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

it("keeps the design review's three light-mode pairs", () => {
  expect(contrast("#FFFFFF", lightColors.primary)).toBeCloseTo(5.02, 1);
  expect(contrast(lightColors.ink, lightColors.paper)).toBeCloseTo(12.96, 1);
  expect(contrast(lightColors.cover, lightColors.paper)).toBeCloseTo(5.21, 1);
});

it("has no cool-hued tag chips", () => {
  expect("chipBackgroundAccent" in lightColors).toBe(false);
  expect("chipBackgroundAccent" in darkColors).toBe(false);
});

it("defines the corner sizes, with action buttons a soft 7px rectangle", () => {
  expect(radii).toEqual({ xs: 4, sm: 8, button: 7, md: 14, pill: 16, full: 999 });
  expect(radii.button).toBeLessThan(radii.pill);
});

describe("typeScale", () => {
  it("keeps the smallest size at 14 or more", () => {
    expect(typeScale.xs).toBeGreaterThanOrEqual(14);
  });
});
