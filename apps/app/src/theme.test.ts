import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ useColorScheme: () => "light" }));
vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));

const { darkColors, lightColors, typeScale } = await import("./theme");

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
    ["danger on paper", c.danger, c.paper, 4.5],
    ["chipTextSubject on chipBackgroundSubject", c.chipTextSubject, c.chipBackgroundSubject, 4.5],
    ["inputBorder vs background", c.inputBorder, c.background, 3],
    ["textFaint on background", c.textFaint, c.background, 4.5],
    ["warning on background", c.warning, c.background, 4.5],
  ])("%s", (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe("typeScale", () => {
  it("keeps the smallest size at 14 or more", () => {
    expect(typeScale.xs).toBeGreaterThanOrEqual(14);
  });
});
