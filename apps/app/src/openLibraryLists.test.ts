import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "./test/asyncStorageMock";
import { pushOpenLibraryAdd, pushOpenLibraryRemove } from "./openLibraryLists";
import { addToList, createList, getList, setMemberOpenLibrarySeed } from "./storage/savedLists";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
const { add, remove } = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
vi.mock("./api/client", () => ({ addOpenLibraryMembers: add, removeOpenLibrarySeed: remove }));

const emma = { type: "work" as const, id: "OL1W", title: "Emma" };

describe("openLibraryLists", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    add.mockReset();
    remove.mockReset();
  });

  it("pushOpenLibraryAdd stores the returned seed", async () => {
    add.mockResolvedValue({ added: [{ type: "work", id: "OL1W", seed: "/works/OL1W" }], missing: [] });
    const l = await createList({ name: "A", kind: "book", openLibraryListId: "/people/x/lists/OL1L" });
    await addToList(l.id, emma);
    expect(await pushOpenLibraryAdd((await getList(l.id))!, { ...emma, addedAt: 1 })).toBe("pushed");
    expect(add).toHaveBeenCalledWith("/people/x/lists/OL1L", [{ type: "work", id: "OL1W" }]);
    expect((await getList(l.id))!.members[0].openLibrarySeed).toBe("/works/OL1W");
  });

  it("pushOpenLibraryAdd skips an unlinked list without calling the API", async () => {
    const l = await createList({ name: "A", kind: "book" });
    expect(await pushOpenLibraryAdd(l, { ...emma, addedAt: 1 })).toBe("skipped");
    expect(add).not.toHaveBeenCalled();
  });

  it("pushOpenLibraryAdd returns 'missing' when the server can't map the ISBN", async () => {
    add.mockResolvedValue({ added: [], missing: [{ type: "work", id: "OL1W" }] });
    const l = await createList({ name: "A", kind: "book", openLibraryListId: "L" });
    await addToList(l.id, emma);
    expect(await pushOpenLibraryAdd((await getList(l.id))!, { ...emma, addedAt: 1 })).toBe("missing");
  });

  it("pushOpenLibraryRemove does nothing for a member that was never pushed", async () => {
    const l = await createList({ name: "A", kind: "book", openLibraryListId: "L" });
    await pushOpenLibraryRemove(l, { ...emma, addedAt: 1 });
    expect(remove).not.toHaveBeenCalled();
  });

  it("pushOpenLibraryRemove removes the seed, unless another member shares it", async () => {
    const l = await createList({ name: "A", kind: "book", openLibraryListId: "L" });
    const m = { ...emma, addedAt: 1, openLibrarySeed: "/works/OL1W" };
    await pushOpenLibraryRemove({ ...l, members: [m] }, m);
    expect(remove).toHaveBeenCalledWith("L", "/works/OL1W");
    remove.mockClear();
    await pushOpenLibraryRemove({ ...l, members: [m, { ...m, type: "book", id: "978" }] }, m);
    expect(remove).not.toHaveBeenCalled();
  });
});
