import { describe, expect, it, vi } from "vitest";
import { tryEachIsbn } from "./isbnFallback.js";

describe("tryEachIsbn", () => {
  it("returns the first non-empty result and stops trying further candidates", async () => {
    const lookup = vi.fn(async (isbn: string) => (isbn === "222" ? "found" : ""));
    const result = await tryEachIsbn(["111", "222", "333"], lookup, {
      sourceName: "test",
      isEmpty: (r) => r === "",
      fallback: "",
    });
    expect(result).toBe("found");
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenNthCalledWith(1, "111");
    expect(lookup).toHaveBeenNthCalledWith(2, "222");
  });

  it("returns the fallback when every candidate is empty", async () => {
    const lookup = vi.fn(async () => "");
    const result = await tryEachIsbn(["111", "222"], lookup, {
      sourceName: "test",
      isEmpty: (r) => r === "",
      fallback: "none",
    });
    expect(result).toBe("none");
  });

  it("treats a rejected lookup the same as an empty result and keeps trying the rest", async () => {
    const lookup = vi.fn(async (isbn: string) => {
      if (isbn === "bad") throw new Error("boom");
      return isbn === "good" ? "found" : "";
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await tryEachIsbn(["bad", "good"], lookup, {
      sourceName: "test",
      isEmpty: (r) => r === "",
      fallback: "",
    });
    expect(result).toBe("found");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("stops after maxAttempts even if untried candidates remain", async () => {
    const lookup = vi.fn(async () => "");
    await tryEachIsbn(["1", "2", "3", "4"], lookup, {
      sourceName: "test",
      isEmpty: () => true,
      fallback: "",
      maxAttempts: 2,
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("returns the fallback immediately when given no candidates", async () => {
    const lookup = vi.fn(async () => "found");
    const result = await tryEachIsbn([], lookup, { sourceName: "test", isEmpty: () => false, fallback: "empty" });
    expect(result).toBe("empty");
    expect(lookup).not.toHaveBeenCalled();
  });
});
