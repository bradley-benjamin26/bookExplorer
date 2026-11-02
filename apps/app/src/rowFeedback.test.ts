import { describe, expect, it } from "vitest";
import { rowFeedback } from "./rowFeedback";

const colors = { pressedBackground: "#p", hoverBackground: "#h" };

describe("rowFeedback", () => {
  it("tints a pressed row", () => {
    expect(rowFeedback(colors, { pressed: true })).toEqual({ backgroundColor: "#p" });
  });
  it("tints a hovered row", () => {
    expect(rowFeedback(colors, { pressed: false, hovered: true })).toEqual({ backgroundColor: "#h" });
  });
  it("prefers pressed over hovered", () => {
    expect(rowFeedback(colors, { pressed: true, hovered: true })).toEqual({ backgroundColor: "#p" });
  });
  it("returns nothing when idle", () => {
    expect(rowFeedback(colors, { pressed: false })).toBeUndefined();
  });
});
