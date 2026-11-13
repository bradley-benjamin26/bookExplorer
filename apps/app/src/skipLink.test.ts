import { describe, expect, it, vi } from "vitest";
import { focusSkipTarget, skipTargetId } from "./skipLink";

describe("skipTargetId", () => {
  it("lowercases and hyphenates", () => {
    expect(skipTargetId("More by this author")).toBe("skip-target-more-by-this-author");
  });
});

describe("focusSkipTarget", () => {
  it("focuses and scrolls to the element", () => {
    const el = { focus: vi.fn(), scrollIntoView: vi.fn() };
    expect(focusSkipTarget("x", { getElementById: () => el })).toBe(true);
    expect(el.focus).toHaveBeenCalled();
    expect(el.scrollIntoView).toHaveBeenCalled();
  });
  it("returns false for a missing id", () => {
    expect(focusSkipTarget("x", { getElementById: () => null })).toBe(false);
  });
});
