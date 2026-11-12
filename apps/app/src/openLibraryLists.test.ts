import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "./test/asyncStorageMock";
import { ApiError } from "./api/client";
import { copyToOpenLibrary, importOpenLibraryList, pushOpenLibraryAdd, pushOpenLibraryRemove, syncWithOpenLibrary } from "./openLibraryLists";
import { getSavedItems } from "./storage/savedItems";
import { addToList, createList, getList, removeFromList, replaceMembers, type SavedList } from "./storage/savedLists";
import { getSavedWork } from "./storage/savedWorks";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
const { add, remove, fetchList, create } = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), fetchList: vi.fn(), create: vi.fn() }));
vi.mock("./api/client", () => ({
  ApiError: class extends Error {
    constructor(message: string, public status: number, public retryAfterSeconds?: number) {
      super(message);
    }
  },
  addOpenLibraryMembers: add,
  removeOpenLibrarySeed: remove,
  fetchOpenLibraryList: fetchList,
  createOpenLibraryList: create,
}));

const emma = { type: "work" as const, id: "OL1W", title: "Emma" };

describe("openLibraryLists", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    add.mockReset();
    remove.mockReset();
    fetchList.mockReset();
    create.mockReset();
    // By default every sent member lands as its work seed.
    add.mockImplementation(async (_l: string, ms: { type: string; id: string }[]) => ({ added: ms.map((m) => ({ ...m, seed: `/works/${m.id}` })), missing: [] }));
    create.mockResolvedValue({ id: "OL9L" });
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

  const listOf = async (n: number, extra: { openLibraryListId?: string; seeded?: number } = {}): Promise<SavedList> => {
    const l = await createList({ name: "L", kind: "book", openLibraryListId: extra.openLibraryListId });
    const members = Array.from({ length: n }, (_, i) => ({ type: "work" as const, id: `OL${i}W`, title: `W${i}`, addedAt: 1, ...(i < (extra.seeded ?? 0) ? { openLibrarySeed: `/works/OL${i}W` } : {}) }));
    await replaceMembers(l.id, members);
    return (await getList(l.id))!;
  };
  const sentIds = () => add.mock.calls.flatMap((c) => c[1].map((m: { id: string }) => m.id));
  const seed = (id: string, type: "work" | "book" | "author" = "work", title = `T${id}`) => ({ seed: `/${type}s/${id}`, title, member: { type, id } });

  it("copyToOpenLibrary creates and links an unlinked list, then sends members in batches of 50", async () => {
    const progress = vi.fn();
    const l = await listOf(120);
    await copyToOpenLibrary(l, progress);
    expect(create).toHaveBeenCalledWith({ name: "L", description: "" });
    expect(add.mock.calls.map((c) => c[1].length)).toEqual([50, 50, 20]);
    expect(add.mock.calls[0][1][0]).toEqual({ type: "work", id: "OL0W" });
    expect(progress).toHaveBeenLastCalledWith(120, 120);
    const after = (await getList(l.id))!;
    expect(after.openLibraryListId).toBe("OL9L");
    expect(after.members.every((m) => m.openLibrarySeed === `/works/${m.id}`)).toBe(true);
  });

  it("copyToOpenLibrary waits Retry-After on 429 and retries the same batch", async () => {
    const ok = add.getMockImplementation()!;
    add.mockImplementationOnce(ok).mockRejectedValueOnce(new ApiError("slow", 429, 30));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onWait = vi.fn();
    await copyToOpenLibrary(await listOf(60), () => {}, sleep, onWait);
    expect(onWait).toHaveBeenCalledWith(30);
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect(add.mock.calls.map((c) => c[1].length)).toEqual([50, 10, 10]);
    expect(add.mock.calls[1][1]).toEqual(add.mock.calls[2][1]);
  });

  it("copyToOpenLibrary resumes: members with seeds are not re-sent", async () => {
    await copyToOpenLibrary(await listOf(5, { openLibraryListId: "OL9L", seeded: 3 }), () => {});
    expect(create).not.toHaveBeenCalled();
    expect(sentIds()).toEqual(["OL3W", "OL4W"]);
  });

  it("copyToOpenLibrary strips stale seeds when the list isn't linked, and reports misses by title", async () => {
    add.mockResolvedValue({ added: [{ type: "work", id: "OL0W", seed: "/works/OL0W" }], missing: [{ type: "work", id: "OL1W" }] });
    const { missing } = await copyToOpenLibrary(await listOf(2, { seeded: 2 }), () => {});
    expect(sentIds()).toEqual(["OL0W", "OL1W"]);
    expect(missing).toEqual(["W1"]);
  });

  it("importOpenLibraryList makes an author list from an all-author list", async () => {
    fetchList.mockResolvedValue({ name: "  ", description: "d", seedCount: 3, seeds: [seed("OL1A", "author"), seed("OL2A", "author"), { seed: "/subjects/x", title: "X", member: null }] });
    const { list, skipped } = await importOpenLibraryList("OL5L");
    expect(list).toMatchObject({ kind: "author", name: "Open Library list", openLibraryListId: "OL5L" });
    expect((await getList(list.id))!.members.map((m) => m.openLibrarySeed)).toEqual(["/authors/OL1A", "/authors/OL2A"]);
    expect(skipped).toEqual(["X"]);
    expect((await getSavedItems()).map((i) => `${i.type}:${i.id}`).sort()).toEqual(["author:OL1A", "author:OL2A"]);
  });

  it("importOpenLibraryList reports subjects, ISBN-less editions and authors on a book list by title", async () => {
    fetchList.mockResolvedValue({
      name: "x".repeat(150),
      description: "",
      seedCount: 4,
      seeds: [seed("OL1W"), seed("OL1A", "author", "Ada"), { seed: "/subjects/love", title: "Love", member: null }, { seed: "/books/OL2M", title: "No ISBN", member: null }],
    });
    const { list, skipped } = await importOpenLibraryList("OL5L");
    expect(list.kind).toBe("book");
    expect(list.name).toHaveLength(100);
    expect((await getList(list.id))!.members.map((m) => m.id)).toEqual(["OL1W"]);
    expect(skipped).toEqual(["Ada", "Love", "No ISBN"]);
    expect((await getSavedItems()).map((i) => `${i.type}:${i.id}`)).toEqual(["work:OL1W"]);
    expect(await getSavedWork("OL1W")).toMatchObject({ openLibraryWorkId: "OL1W", authorNames: [] });
  });

  it("syncWithOpenLibrary refuses to prune when fewer seeds than seedCount arrive", async () => {
    const l = await listOf(2, { openLibraryListId: "OL9L", seeded: 2 });
    await removeFromList(l.id, "work", "OL1W"); // a pending remote delete must not run either
    fetchList.mockResolvedValue({ name: "L", description: "", seedCount: 3, seeds: [seed("OL0W")] });
    await expect(syncWithOpenLibrary((await getList(l.id))!)).rejects.toThrow("Open Library sent only part of this list, so nothing was removed. Try again later.");
    expect((await getList(l.id))!.members.map((m) => m.id)).toEqual(["OL0W"]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("syncWithOpenLibrary finishes a pending remote delete instead of re-adding it", async () => {
    const l = await listOf(2, { openLibraryListId: "OL9L", seeded: 2 });
    await removeFromList(l.id, "work", "OL1W");
    fetchList.mockResolvedValue({ name: "L", description: "", seedCount: 3, seeds: [seed("OL0W"), seed("OL1W"), seed("OL7W")] });
    await syncWithOpenLibrary((await getList(l.id))!);
    expect(remove).toHaveBeenCalledWith("OL9L", "/works/OL1W");
    const after = (await getList(l.id))!;
    expect(after.members.map((m) => m.id)).toEqual(["OL0W", "OL7W"]);
    expect(after.removedMembers?.some((r) => r.openLibrarySeed)).toBeFalsy();
  });

  it("syncWithOpenLibrary pushes a seedless local member that Open Library already has, without duplicating it", async () => {
    const l = await listOf(1, { openLibraryListId: "OL9L" });
    fetchList.mockResolvedValue({ name: "L", description: "", seedCount: 1, seeds: [seed("OL0W")] });
    await syncWithOpenLibrary(l);
    expect(sentIds()).toEqual(["OL0W"]);
    expect((await getList(l.id))!.members).toEqual([expect.objectContaining({ id: "OL0W", openLibrarySeed: "/works/OL0W" })]);
  });

  it("syncWithOpenLibrary drops members removed on Open Library", async () => {
    const l = await listOf(2, { openLibraryListId: "OL9L", seeded: 2 });
    fetchList.mockResolvedValue({ name: "L", description: "", seedCount: 1, seeds: [seed("OL0W")] });
    await syncWithOpenLibrary(l);
    expect((await getList(l.id))!.members.map((m) => m.id)).toEqual(["OL0W"]);
  });

  it("syncWithOpenLibrary saves works pulled from Open Library", async () => {
    const l = await listOf(0, { openLibraryListId: "OL9L" });
    fetchList.mockResolvedValue({ name: "L", description: "", seedCount: 1, seeds: [seed("OL7W")] });
    await syncWithOpenLibrary(l);
    expect((await getSavedItems()).map((i) => `${i.type}:${i.id}`)).toEqual(["work:OL7W"]);
    expect(await getSavedWork("OL7W")).not.toBeNull();
  });

  it("syncWithOpenLibrary names the seeds it couldn't sync", async () => {
    const l = await listOf(0, { openLibraryListId: "OL9L" });
    fetchList.mockResolvedValue({ name: "L", description: "", seedCount: 3, seeds: [seed("OL1W"), { seed: "/subjects/love", title: "Love", member: null }, seed("OL1A", "author", "Ada")] });
    expect((await syncWithOpenLibrary(l)).skipped).toEqual(["Love", "Ada"]);
  });

  it("syncWithOpenLibrary reports a book Open Library doesn't have by title and keeps it here", async () => {
    const l = await createList({ name: "L", kind: "book", openLibraryListId: "OL9L" });
    await addToList(l.id, { type: "book", id: "9780000000000", title: "Rare" });
    add.mockResolvedValue({ added: [], missing: [{ type: "book", id: "9780000000000" }] });
    fetchList.mockResolvedValue({ name: "L", description: "", seedCount: 0, seeds: [] });
    expect((await syncWithOpenLibrary((await getList(l.id))!)).missing).toEqual(["Rare"]);
    expect((await getList(l.id))!.members.map((m) => m.title)).toEqual(["Rare"]);
  });
});
