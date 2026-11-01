import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "./test/asyncStorageMock";
import { ApiError } from "./api/client";
import { pushAdd, pushRemove } from "./hardcoverLists";
import { createList, addToList, getList } from "./storage/savedLists";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
const { add, remove } = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
vi.mock("./api/client", () => ({
  ApiError: class extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  },
  addHardcoverListBook: add,
  removeHardcoverListBook: remove,
}));

const emma = { type: "work" as const, id: "OL1W", title: "Emma" };

describe("hardcoverLists", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    add.mockReset();
    remove.mockReset();
  });

  it("pushAdd stores the returned hardcoverBookId", async () => {
    add.mockResolvedValue({ hardcoverBookId: 77 });
    const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
    await addToList(l.id, emma);
    expect(await pushAdd((await getList(l.id))!, { ...emma, addedAt: 1 })).toBe("pushed");
    expect(add).toHaveBeenCalledWith(5, { type: "work", id: "OL1W" });
    expect((await getList(l.id))!.members[0].hardcoverBookId).toBe(77);
  });

  it("pushAdd skips authors and unlinked lists without calling the API", async () => {
    const linked = await createList({ name: "A", kind: "author", hardcoverListId: 5 });
    const unlinked = await createList({ name: "B", kind: "book" });
    expect(await pushAdd(linked, { type: "author", id: "OL1A", title: "x", addedAt: 1 })).toBe("skipped");
    expect(await pushAdd(unlinked, { ...emma, addedAt: 1 })).toBe("skipped");
    expect(add).not.toHaveBeenCalled();
  });

  it("pushAdd returns 'missing' on 404", async () => {
    add.mockRejectedValue(new ApiError("nope", 404));
    const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
    expect(await pushAdd(l, { ...emma, addedAt: 1 })).toBe("missing");
  });

  it("pushRemove does nothing for a member that was never pushed", async () => {
    const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
    await pushRemove(l, { ...emma, addedAt: 1 });
    expect(remove).not.toHaveBeenCalled();
  });

  it("pushRemove sends the list and book ids", async () => {
    const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
    await pushRemove(l, { ...emma, addedAt: 1, hardcoverBookId: 77 });
    expect(remove).toHaveBeenCalledWith(5, 77);
  });
});
