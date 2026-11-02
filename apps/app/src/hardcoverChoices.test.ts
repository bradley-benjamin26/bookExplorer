import { describe, expect, it } from "vitest";
import { hardcoverChoices } from "./hardcoverChoices";
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
