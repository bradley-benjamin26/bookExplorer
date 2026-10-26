import { describe, expect, it, vi } from "vitest";
import { darkColors, lightColors } from "./theme";

// theme.ts pulls in react-native (Flow source, unparseable under node vitest); only the colour tables are needed.
vi.mock("react-native", () => ({ useColorScheme: () => "light" }));
vi.mock("./storage/themePreference", () => ({}));

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

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
])("%s theme contrast against background", (name, colors) => {
  it(`${name} inputBorder ≥ 3:1`, () => {
    expect(contrast(colors.inputBorder, colors.background)).toBeGreaterThanOrEqual(3);
  });
  it(`${name} textFaint ≥ 4.5:1`, () => {
    expect(contrast(colors.textFaint, colors.background)).toBeGreaterThanOrEqual(4.5);
  });
  it(`${name} warning ≥ 4.5:1`, () => {
    expect(contrast(colors.warning, colors.background)).toBeGreaterThanOrEqual(4.5);
  });
});
