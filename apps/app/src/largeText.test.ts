import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ useWindowDimensions: () => ({ fontScale: 1 }) }));
const { isLargeText } = await import("./largeText");

describe("isLargeText", () => {
  it.each([
    [1, false],
    [1.18, false],
    [1.3, true],
    [1.35, true],
    [3.1, true],
  ])("fontScale %s → %s", (scale, expected) => {
    expect(isLargeText(scale)).toBe(expected);
  });
});
