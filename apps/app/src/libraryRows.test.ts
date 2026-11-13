import { describe, expect, it } from "vitest";
import { ACCOUNT_ROWS, DISCOVERY_ROWS, LIBRARY_PRIMARY, LIBRARY_TOOLS } from "./libraryRows";

const ALL = [...LIBRARY_PRIMARY, ...LIBRARY_TOOLS];

describe("library rows", () => {
  it("puts Hardcover first", () => expect(ALL[0].id).toBe("hardcover"));
  it("has unique ids across both groups", () => expect(new Set(ALL.map((r) => r.id)).size).toBe(ALL.length));
  it("keeps the primary label order", () =>
    expect(LIBRARY_PRIMARY.map((r) => r.label)).toEqual(["Hardcover account", "My Open Library Account", "Recommendations", "Find connection"]));
  it("keeps the tools label order", () => expect(LIBRARY_TOOLS.map((r) => r.label)).toEqual(["Import & export", "Settings"]));
  it("splits the primary rows into accounts and discovery", () => {
    expect(ACCOUNT_ROWS.map((r) => r.id)).toEqual(["hardcover", "openlibrary"]);
    expect(DISCOVERY_ROWS.map((r) => r.id)).toEqual(["recommendations", "connection"]);
    expect([...ACCOUNT_ROWS, ...DISCOVERY_ROWS]).toEqual([...LIBRARY_PRIMARY]);
  });
  it("lists accounts before discovery in the combined order", () =>
    expect([...ACCOUNT_ROWS, ...DISCOVERY_ROWS].map((r) => r.id)).toEqual(["hardcover", "openlibrary", "recommendations", "connection"]));
});
