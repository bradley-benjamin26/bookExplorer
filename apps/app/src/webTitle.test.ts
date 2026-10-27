import { describe, expect, it, vi } from "vitest";
import { titleRef } from "./webTitle";

describe("titleRef", () => {
  it("sets the title attribute on DOM-like nodes", () => {
    const el = { setAttribute: vi.fn() };
    titleRef("Zoom in")(el);
    expect(el.setAttribute).toHaveBeenCalledWith("title", "Zoom in");
  });
  it("ignores null, native-like nodes and undefined text", () => {
    expect(() => titleRef("Zoom in")(null)).not.toThrow();
    expect(() => titleRef("Zoom in")({})).not.toThrow();
    const el = { setAttribute: vi.fn() };
    titleRef(undefined)(el);
    expect(el.setAttribute).not.toHaveBeenCalled();
  });
});
