import { describe, expect, it, vi } from "vitest";
import { titleRef, tooltipAction, tooltipPosition } from "./webTitle";

describe("titleRef", () => {
  it("sets the data-tooltip attribute on DOM-like nodes", () => {
    const el = { setAttribute: vi.fn() };
    titleRef("Zoom in")(el);
    expect(el.setAttribute).toHaveBeenCalledWith("data-tooltip", "Zoom in");
  });
  it("ignores null, native-like nodes and undefined text", () => {
    expect(() => titleRef("Zoom in")(null)).not.toThrow();
    expect(() => titleRef("Zoom in")({})).not.toThrow();
    expect(() => titleRef(undefined)({})).not.toThrow();
    expect(() => titleRef(undefined)(null)).not.toThrow();
  });
  it("removes a stale data-tooltip when text is undefined", () => {
    const el = { setAttribute: vi.fn(), removeAttribute: vi.fn() };
    titleRef(undefined)(el);
    expect(el.removeAttribute).toHaveBeenCalledWith("data-tooltip");
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

describe("tooltipAction", () => {
  it("ignores touch hover, shows for mouse hover", () => {
    expect(tooltipAction("pointerover", { pointerType: "touch" })).toBe("ignore");
    expect(tooltipAction("pointerover", { pointerType: "mouse" })).toBe("show");
  });
  it("hides on pointerdown and Escape", () => {
    expect(tooltipAction("pointerdown")).toBe("hide");
    expect(tooltipAction("escape")).toBe("hide");
  });
  it("ignores the focus that follows a press, shows keyboard focus", () => {
    expect(tooltipAction("focusin", { pressed: true })).toBe("ignore");
    expect(tooltipAction("focusin", { pressed: false })).toBe("show");
  });
});
