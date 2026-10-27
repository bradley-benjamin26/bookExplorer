import { describe, expect, it, vi } from "vitest";
import { titleRef, tooltipPosition } from "./webTitle";

describe("titleRef", () => {
  it("sets the data-tooltip attribute on DOM-like nodes", () => {
    const el = { setAttribute: vi.fn() };
    titleRef("Zoom in")(el);
    expect(el.setAttribute).toHaveBeenCalledWith("data-tooltip", "Zoom in");
  });
  it("ignores null, native-like nodes and undefined text", () => {
    expect(() => titleRef("Zoom in")(null)).not.toThrow();
    expect(() => titleRef("Zoom in")({})).not.toThrow();
    const el = { setAttribute: vi.fn() };
    titleRef(undefined)(el);
    expect(el.setAttribute).not.toHaveBeenCalled();
  });
});

describe("tooltipPosition", () => {
  const vp = { width: 400, height: 800 };
  it("centres the tip below the target", () =>
    expect(tooltipPosition({ x: 100, y: 10, width: 40, height: 40 }, { width: 60, height: 20 }, vp)).toEqual({ left: 90, top: 56 }));
  it("keeps the tip inside the viewport", () =>
    expect(tooltipPosition({ x: 380, y: 10, width: 20, height: 20 }, { width: 100, height: 20 }, vp).left).toBe(292));
  it("flips above when there is no room below", () =>
    expect(tooltipPosition({ x: 100, y: 770, width: 40, height: 20 }, { width: 60, height: 20 }, vp).top).toBe(744));
});
