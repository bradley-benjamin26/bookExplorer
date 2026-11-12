import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "./test/asyncStorageMock";
import { ApiError } from "./api/client";
import { copyToHardcover, importChosenLists, importList, pushAdd, pushRemove, syncWithHardcover } from "./hardcoverLists";
import { getSavedBook, saveListedBook, unsaveBook, updateSavedBook } from "./storage/savedBooks";
import { getSavedItems } from "./storage/savedItems";
import { createList, addToList, getList, isOnAnyList, linkList, removeFromList, replaceMembers } from "./storage/savedLists";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
const { add, remove, fetchList, create } = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), fetchList: vi.fn(), create: vi.fn() }));
vi.mock("./api/client", () => ({
  ApiError: class extends Error {
    constructor(message: string, public status: number, public retryAfterSeconds?: number) {
      super(message);
    }
  },
  addHardcoverListBook: add,
  removeHardcoverListBook: remove,
  fetchHardcoverList: fetchList,
  createHardcoverList: create,
}));

const emma = { type: "work" as const, id: "OL1W", title: "Emma" };

describe("hardcoverLists", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    add.mockReset();
    remove.mockReset();
    fetchList.mockReset();
    create.mockReset();
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

  it("pushRemove keeps the remote row while another member maps to the same Hardcover book", async () => {
    const work = { ...emma, addedAt: 1, hardcoverBookId: 77 };
    const edition = { type: "book" as const, id: "9780141439587", title: "Emma", addedAt: 2, hardcoverBookId: 77 };
    const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
    await pushRemove({ ...l, members: [work, edition] }, work);
    expect(remove).not.toHaveBeenCalled();
  });

  const seed = async (ids: string[], hardcoverListId?: number) => {
    const l = await createList({ name: "A", kind: "book", hardcoverListId });
    for (const id of ids) await addToList(l.id, { type: "work", id, title: id });
    return (await getList(l.id))!;
  };
  const sentIds = () => add.mock.calls.map((c) => c[1].id);

  it("copyToHardcover waits Retry-After on 429 and retries the same member", async () => {
    add
      .mockResolvedValueOnce({ hardcoverBookId: 1 })
      .mockRejectedValueOnce(new ApiError("slow", 429, 30))
      .mockResolvedValue({ hardcoverBookId: 2 });
    create.mockResolvedValue({ id: 9 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await copyToHardcover(await seed(["a", "b", "c"]), () => {}, sleep);
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect(sentIds()).toEqual(["a", "b", "b", "c"]);
  });

  it("importChosenLists returns the new local list ids in order", async () => {
    fetchList.mockImplementation(async (id: number) => ({ name: `H${id}`, description: "", booksCount: 0, books: [] }));
    const ids = await importChosenLists([7, 8]);
    expect(ids).toHaveLength(2);
    expect((await getList(ids[0]))!.hardcoverListId).toBe(7);
    expect((await getList(ids[1]))!.hardcoverListId).toBe(8);
  });

  it("importChosenLists stops at the first failure and rethrows", async () => {
    fetchList
      .mockResolvedValueOnce({ name: "A", description: "", booksCount: 0, books: [] })
      .mockRejectedValueOnce(new ApiError("boom", 500));
    await expect(importChosenLists([1, 2, 3])).rejects.toThrow("boom");
    expect(fetchList).toHaveBeenCalledTimes(2);
  });

  it("calls onWait with the retry delay before sleeping on a 429", async () => {
    add
      .mockResolvedValueOnce({ hardcoverBookId: 1 })
      .mockRejectedValueOnce(new ApiError("slow", 429, 30))
      .mockResolvedValue({ hardcoverBookId: 2 });
    create.mockResolvedValue({ id: 9 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onWait = vi.fn();
    await copyToHardcover(await seed(["a", "b"]), () => {}, sleep, onWait);
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledWith(30);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("copyToHardcover gives up on a member after 5 rate-limit retries", async () => {
    add.mockRejectedValue(new ApiError("slow", 429, 1));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(copyToHardcover(await seed(["a"], 5), () => {}, sleep)).rejects.toThrow("slow");
    expect(sleep).toHaveBeenCalledTimes(5);
    expect(add).toHaveBeenCalledTimes(6);
  });

  it("copyToHardcover reports missing titles and continues, and rethrows other errors", async () => {
    create.mockResolvedValue({ id: 9 });
    add.mockResolvedValueOnce({ hardcoverBookId: 1 }).mockRejectedValueOnce(new ApiError("no", 404)).mockResolvedValue({ hardcoverBookId: 3 });
    const progress = vi.fn();
    const l = await seed(["a", "b", "c"]);
    expect((await copyToHardcover(l, progress, vi.fn())).missing).toEqual(["b"]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    add.mockReset();
    add.mockRejectedValue(new ApiError("boom", 500));
    await expect(copyToHardcover(await seed(["x"], 5), () => {}, vi.fn())).rejects.toThrow("boom");
  });

  it("copyToHardcover counts and skips authors", async () => {
    create.mockResolvedValue({ id: 9 });
    add.mockResolvedValue({ hardcoverBookId: 1 });
    const l = await seed(["a"]);
    await replaceMembers(l.id, [...l.members, { type: "author", id: "OL1A", title: "Au", addedAt: 1 }]);
    const progress = vi.fn();
    const r = await copyToHardcover((await getList(l.id))!, progress, vi.fn());
    expect(r.skippedAuthors).toBe(1);
    expect(progress).toHaveBeenCalledWith(1, 1);
    expect(sentIds()).toEqual(["a"]);
  });

  it("copyToHardcover resumes a linked list: already-pushed members are not re-sent", async () => {
    add.mockResolvedValue({ hardcoverBookId: 2 });
    const l = await seed(["a", "b"], 5);
    await replaceMembers(l.id, [{ ...l.members[0], hardcoverBookId: 1 }, l.members[1]]);
    await copyToHardcover((await getList(l.id))!, () => {}, vi.fn());
    expect(create).not.toHaveBeenCalled();
    expect(sentIds()).toEqual(["b"]);
  });

  it("copyToHardcover on an unlinked list pushes every member, after stripping stale ids", async () => {
    create.mockResolvedValue({ id: 9 });
    add.mockResolvedValue({ hardcoverBookId: 2 });
    const l = await seed(["a", "b"]);
    await replaceMembers(l.id, l.members.map((m) => ({ ...m, hardcoverBookId: 99 })));
    await copyToHardcover((await getList(l.id))!, () => {}, vi.fn());
    expect(sentIds()).toEqual(["a", "b"]);
    expect(add.mock.calls[0][0]).toBe(9);
    expect((await getList(l.id))!.hardcoverListId).toBe(9);
  });

  it("importList creates a linked book list and reports ISBN-less titles", async () => {
    fetchList.mockResolvedValue({
      name: "Faves",
      description: "d",
      booksCount: 2,
      books: [
        { hardcoverBookId: 1, title: "One", isbn: "111" },
        { hardcoverBookId: 2, title: "Two", isbn: null },
      ],
    });
    const { list, skipped } = await importList(7);
    expect(skipped).toEqual(["Two"]);
    const saved = (await getList(list.id))!;
    expect(saved.hardcoverListId).toBe(7);
    expect(saved.members.map((m) => [m.id, m.hardcoverBookId])).toEqual([["111", 1]]);
  });

  it("syncWithHardcover pushes then reconciles against the remote, and rejects unlinked lists", async () => {
    add.mockResolvedValue({ hardcoverBookId: 5 });
    fetchList.mockResolvedValue({ name: "A", description: "", booksCount: 2, books: [{ hardcoverBookId: 5, title: "a", isbn: null }, { hardcoverBookId: 8, title: "New", isbn: "888" }] });
    const l = await seed(["a"], 5);
    await syncWithHardcover(l);
    expect((await getList(l.id))!.members.map((m) => m.id)).toEqual(["a", "888"]);
    await expect(syncWithHardcover(await seed(["z"]))).rejects.toThrow("This list isn't linked to Hardcover.");
  });

  it("syncWithHardcover changes nothing locally when the remote list came back truncated", async () => {
    add.mockResolvedValue({ hardcoverBookId: 5 });
    fetchList.mockResolvedValue({ name: "A", description: "", booksCount: 3, books: [{ hardcoverBookId: 8, title: "New", isbn: "888" }] });
    const l = await seed(["a", "b"], 5);
    await replaceMembers(l.id, l.members.map((m) => ({ ...m, hardcoverBookId: 5 })));
    const before = (await getList(l.id))!.members;
    await expect(syncWithHardcover((await getList(l.id))!)).rejects.toThrow("Hardcover sent only part of this list, so nothing was removed. Try again later.");
    expect((await getList(l.id))!.members).toEqual(before);
  });

  describe("removals that failed on Hardcover", () => {
    const remoteWith9 = { name: "A", description: "", booksCount: 1, books: [{ hardcoverBookId: 9, isbn: "X", title: "T" }] };
    async function removedLocally() {
      const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
      await addToList(l.id, { type: "book", id: "X", title: "T" });
      await replaceMembers(l.id, (await getList(l.id))!.members.map((m) => ({ ...m, hardcoverBookId: 9 })));
      await removeFromList(l.id, "book", "X");
      return l.id;
    }

    it("sync removes on Hardcover a book whose removal failed, and doesn't re-add it", async () => {
      const id = await removedLocally();
      fetchList.mockResolvedValue(remoteWith9);
      await syncWithHardcover((await getList(id))!);
      expect(remove).toHaveBeenCalledWith(5, 9);
      expect((await getList(id))!.members).toEqual([]);
      expect(await getSavedBook("X")).toBeNull();
    });

    it("sync forgets settled removals, so a book re-added on Hardcover stays", async () => {
      const id = await removedLocally();
      fetchList.mockResolvedValue(remoteWith9);
      await syncWithHardcover((await getList(id))!);
      await syncWithHardcover((await getList(id))!);
      expect(remove).toHaveBeenCalledTimes(1);
      expect((await getList(id))!.members.map((m) => m.id)).toEqual(["X"]);
    });

    it("sync keeps a book removed and then re-added locally", async () => {
      const id = await removedLocally();
      await addToList(id, { type: "book", id: "X", title: "T" });
      add.mockResolvedValue({ hardcoverBookId: 9 });
      fetchList.mockResolvedValue(remoteWith9);
      await syncWithHardcover((await getList(id))!);
      expect(remove).not.toHaveBeenCalled();
      expect((await getList(id))!.members.map((m) => m.id)).toEqual(["X"]);
    });
  });

  it("an interrupted fresh copy followed by sync keeps every local member", async () => {
    create.mockResolvedValue({ id: 9 });
    let next = 0;
    const remote: number[] = [];
    add.mockImplementation(async () => {
      if (next === 1 && !remote.includes(-1)) {
        remote.push(-1);
        throw new ApiError("boom", 500);
      }
      remote.push(++next);
      return { hardcoverBookId: next };
    });
    fetchList.mockImplementation(async () => ({ name: "A", description: "", booksCount: remote.filter((n) => n > 0).length, books: remote.filter((n) => n > 0).map((n) => ({ hardcoverBookId: n, title: "t", isbn: null })) }));
    const l = await seed(["a", "b", "c"]);
    await replaceMembers(l.id, l.members.map((m) => ({ ...m, hardcoverBookId: 99 })));
    await expect(copyToHardcover((await getList(l.id))!, () => {}, vi.fn())).rejects.toThrow("boom");
    await syncWithHardcover((await getList(l.id))!);
    expect((await getList(l.id))!.members.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  describe("saving listed books", () => {
    const dune = { hardcoverBookId: 1, title: "Dune", isbn: "9780441013593" };
    const remoteList = { name: "HC", description: "", booksCount: 1, books: [dune] };

    it("importList saves each imported book", async () => {
      fetchList.mockResolvedValue(remoteList);
      await importList(9);
      expect(await getSavedBook(dune.isbn)).toMatchObject({ title: "Dune", notes: "" });
      expect(await getSavedItems()).toContainEqual(expect.objectContaining({ type: "book", id: dune.isbn }));
    });

    it("importList brings back a book the user had removed", async () => {
      await saveListedBook(dune.isbn, "Dune");
      await unsaveBook(dune.isbn);
      fetchList.mockResolvedValue(remoteList);
      await importList(9);
      expect(await getSavedBook(dune.isbn)).not.toBeNull();
    });

    it("importList keeps an already-saved book's notes", async () => {
      await saveListedBook(dune.isbn, "Dune");
      await updateSavedBook(dune.isbn, { notes: "mine" });
      fetchList.mockResolvedValue(remoteList);
      await importList(9);
      expect(await getSavedBook(dune.isbn)).toMatchObject({ notes: "mine" });
    });

    it("syncWithHardcover saves books it pulls in and unsaves ones Hardcover dropped", async () => {
      const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
      await addToList(l.id, { type: "book", id: "A", title: "A" });
      await saveListedBook("A", "A");
      await replaceMembers(l.id, (await getList(l.id))!.members.map((m) => ({ ...m, hardcoverBookId: 2 })));
      fetchList.mockResolvedValue(remoteList);
      await syncWithHardcover((await getList(l.id))!);
      expect(await getSavedBook(dune.isbn)).toMatchObject({ title: "Dune" });
      expect(await getSavedBook("A")).toBeNull();
    });

    it("syncWithHardcover keeps a dropped book that has notes, moving it to the default list", async () => {
      const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
      await addToList(l.id, { type: "book", id: "A", title: "A" });
      await saveListedBook("A", "A");
      await updateSavedBook("A", { notes: "mine" });
      await replaceMembers(l.id, (await getList(l.id))!.members.map((m) => ({ ...m, hardcoverBookId: 2 })));
      fetchList.mockResolvedValue(remoteList);
      await syncWithHardcover((await getList(l.id))!);
      expect(await getSavedBook("A")).toMatchObject({ notes: "mine" });
      expect(await isOnAnyList("book", "A")).toBe(true);
    });

    it("syncWithHardcover keeps a dropped book that is still on another list", async () => {
      const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
      const other = await createList({ name: "B", kind: "book" });
      for (const id of [l.id, other.id]) await addToList(id, { type: "book", id: "A", title: "A" });
      await saveListedBook("A", "A");
      await replaceMembers(l.id, (await getList(l.id))!.members.map((m) => ({ ...m, hardcoverBookId: 2 })));
      fetchList.mockResolvedValue(remoteList);
      await syncWithHardcover((await getList(l.id))!);
      expect(await getSavedBook("A")).not.toBeNull();
      expect((await getList(other.id))!.members.map((m) => m.id)).toEqual(["A"]);
    });

    it("syncWithHardcover saves books already on the list that were never saved", async () => {
      const l = await createList({ name: "A", kind: "book", hardcoverListId: 5 });
      await replaceMembers(l.id, [{ type: "book", id: dune.isbn, title: "Dune", addedAt: 1, hardcoverBookId: 1 }]);
      fetchList.mockResolvedValue(remoteList);
      await syncWithHardcover((await getList(l.id))!);
      expect(await getSavedBook(dune.isbn)).not.toBeNull();
    });
  });
});
