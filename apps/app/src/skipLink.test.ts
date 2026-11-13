import { describe, expect, it, vi } from "vitest";
import { focusSkipTarget, skipTargetId } from "./skipLink";

describe("skipTargetId", () => {
  it("lowercases and hyphenates", () => {
    expect(skipTargetId("More by this author")).toBe("skip-target-more-by-this-author");
  });
});

const target = (visible: boolean) => ({
  focus: vi.fn(),
  scrollIntoView: vi.fn(),
  getClientRects: () => (visible ? [{}] : []),
});
const docOf = (...els: ReturnType<typeof target>[]) => ({ querySelectorAll: () => els });

describe("focusSkipTarget", () => {
  it("focuses and scrolls to the element", () => {
    const el = target(true);
    expect(focusSkipTarget("x", docOf(el))).toBe(true);
    expect(el.focus).toHaveBeenCalled();
    expect(el.scrollIntoView).toHaveBeenCalled();
  });
  it("returns false for a missing id", () => {
    expect(focusSkipTarget("x", docOf())).toBe(false);
  });
  it("skips a hidden earlier target (a screen kept mounted under the stack) for the visible one after the link", () => {
    const hidden = target(false);
    const shown = target(true);
    const link = { compareDocumentPosition: (t: unknown) => (t === shown ? 4 : 2) };
    expect(focusSkipTarget("x", docOf(hidden, shown), link)).toBe(true);
    expect(shown.focus).toHaveBeenCalled();
    expect(hidden.focus).not.toHaveBeenCalled();
  });
  it("returns false and focuses nothing when every target is hidden", () => {
    const a = target(false);
    const b = target(false);
    expect(focusSkipTarget("x", docOf(a, b))).toBe(false);
    expect(a.focus).not.toHaveBeenCalled();
    expect(b.focus).not.toHaveBeenCalled();
  });
});
