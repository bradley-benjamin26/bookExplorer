import { describe, expect, it } from "vitest";
import { LIBRARY_PRIMARY, LIBRARY_TOOLS } from "./libraryRows";

const ALL = [...LIBRARY_PRIMARY, ...LIBRARY_TOOLS];

describe("library rows", () => {
  it("puts Hardcover first", () => expect(ALL[0].id).toBe("hardcover"));
  it("has unique ids across both groups", () => expect(new Set(ALL.map((r) => r.id)).size).toBe(ALL.length));
  it("keeps the primary label order", () =>
    expect(LIBRARY_PRIMARY.map((r) => r.label)).toEqual(["Hardcover", "Recommendations", "Find Connection"]));
  it("keeps the tools label order", () => expect(LIBRARY_TOOLS.map((r) => r.label)).toEqual(["Import & Export", "Settings"]));
});
