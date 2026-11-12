import { describe, expect, it } from "vitest";
import { reconcileOpenLibrary } from "./openLibraryReconcile";
import type { ListMember } from "./savedLists";

const m = (id: string, extra: Partial<ListMember> = {}): ListMember => ({ type: "work", id, title: id, addedAt: 1, ...extra });
const seed = (id: string, type: "work" | "book" | "author" = "work", title = `T${id}`) => ({ seed: `/${type}s/${id}`, title, member: { type, id } });

describe("reconcileOpenLibrary", () => {
  it("keeps unpushed local members", () => {
    expect(reconcileOpenLibrary([m("OL1W")], [], "book", 2)).toEqual([m("OL1W")]);
  });
  it("drops members removed on Open Library", () => {
    const local = [m("OL1W", { openLibrarySeed: "/works/OL1W" }), m("OL2W", { openLibrarySeed: "/works/OL2W" })];
    expect(reconcileOpenLibrary(local, [seed("OL1W")], "book", 2)).toEqual([local[0]]);
  });
  it("adds Open Library-only works and books with their seed", () => {
    expect(reconcileOpenLibrary([m("OL1W")], [seed("OL5W"), seed("OL6M", "book")], "book", 9)).toEqual([
      m("OL1W"),
      { type: "work", id: "OL5W", title: "TOL5W", openLibrarySeed: "/works/OL5W", addedAt: 9 },
      { type: "book", id: "OL6M", title: "TOL6M", openLibrarySeed: "/books/OL6M", addedAt: 9 },
    ]);
  });
  it("adds authors to author lists", () => {
    expect(reconcileOpenLibrary([], [seed("OL1A", "author")], "author", 3)).toEqual([
      { type: "author", id: "OL1A", title: "TOL1A", openLibrarySeed: "/authors/OL1A", addedAt: 3 },
    ]);
  });
  it("skips null members and members of the wrong kind", () => {
    const remote = [{ seed: "/authors/OL1A", title: "Ada", member: { type: "author" as const, id: "OL1A" } }, { seed: "/books/OL2M", title: "No ISBN", member: null }];
    expect(reconcileOpenLibrary([], remote, "book", 1)).toEqual([]);
  });
  it("never duplicates a local member that matches a remote seed by type and id", () => {
    expect(reconcileOpenLibrary([m("OL1W")], [seed("OL1W")], "book", 2)).toEqual([m("OL1W")]);
  });
});
