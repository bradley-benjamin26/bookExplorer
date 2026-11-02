import { describe, expect, it } from "vitest";
import { hardcoverChoices, keepOffered, linkedTo, listsNotHolding } from "./hardcoverChoices";
import type { SavedList } from "./storage/savedLists";

const remote = (id: number) => ({ id, name: `L${id}`, description: "", booksCount: 1 });
const local = (hardcoverListId?: number) => ({ id: `x${hardcoverListId}`, hardcoverListId }) as SavedList;

describe("hardcoverChoices", () => {
  it("drops lists already linked to a local list", () => {
    expect(hardcoverChoices([remote(1), remote(2)], [local(2), local(undefined)]).map((l) => l.id)).toEqual([1]);
  });

  it("keeps the rest in remote order", () => {
    expect(hardcoverChoices([remote(3), remote(1), remote(2)], [local(1)]).map((l) => l.id)).toEqual([3, 2]);
  });
});

describe("keepOffered", () => {
  it("drops ticked ids no longer offered", () => {
    expect([...keepOffered(new Set([1, 2, 3]), [remote(2), remote(3)])]).toEqual([2, 3]);
  });
});

describe("listsNotHolding", () => {
  const withMember = (id: string, held: boolean) =>
    ({ id, members: held ? [{ type: "work", id: "w1" }] : [] }) as unknown as SavedList;
  it("keeps only the ids whose list lacks the member", () => {
    const lists = [withMember("a", true), withMember("b", false)];
    expect(listsNotHolding(lists, { type: "work", id: "w1" }, ["a", "b", "gone"])).toEqual(["b"]);
  });
});

describe("linkedTo", () => {
  it("returns the local ids linked to the ticked remote ids", () => {
    const l = (id: string, h?: number) => ({ id, hardcoverListId: h }) as SavedList;
    expect(linkedTo(new Set([1, 2]), [l("a", 1), l("b", 3), l("c")])).toEqual(["a"]);
  });
});
