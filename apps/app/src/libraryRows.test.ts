import { describe, expect, it } from "vitest";
import { LIBRARY_ROWS } from "./libraryRows";

describe("LIBRARY_ROWS", () => {
  it("puts Hardcover first", () => expect(LIBRARY_ROWS[0].id).toBe("hardcover"));
  it("has unique ids", () => expect(new Set(LIBRARY_ROWS.map((r) => r.id)).size).toBe(LIBRARY_ROWS.length));
  it("keeps the label order", () =>
    expect(LIBRARY_ROWS.map((r) => r.label)).toEqual(["Hardcover", "Lists", "Recommendations", "Find Connection", "Import & Export", "Settings"]));
});
