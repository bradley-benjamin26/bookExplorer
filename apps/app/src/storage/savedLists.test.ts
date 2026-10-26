import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { addToList, createList, deleteList, getAllLists, getList, getLists, removeFromList } from "./savedLists";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const dune = { type: "book" as const, id: "9780441013593", title: "Dune" };
const emma = { type: "work" as const, id: "OL1W", title: "Emma" };
const austen = { type: "author" as const, id: "OL1A", title: "Jane Austen" };

describe("savedLists", () => {
  beforeEach(() => AsyncStorage.clear());

  it("createList trims the name and rejects an empty one", async () => {
    const list = await createList({ name: "  To read  ", kind: "book" });
    expect(list).toMatchObject({ name: "To read", description: "", kind: "book", members: [] });
    expect(list.id).toMatch(/^list-[a-z0-9]+-[a-z0-9]+$/);
    expect(await getList(list.id)).toEqual(list);
    await expect(createList({ name: "   ", kind: "book" })).rejects.toThrow();
    await expect(createList({ name: "x".repeat(101), kind: "book" })).rejects.toThrow();
    await expect(createList({ name: "ok", description: "x".repeat(1001), kind: "book" })).rejects.toThrow();
  });

  it('getLists("book") excludes author lists and deleted lists', async () => {
    const books = await createList({ name: "Books", kind: "book" });
    await createList({ name: "Authors", kind: "author" });
    const gone = await createList({ name: "Gone", kind: "book" });
    await deleteList(gone.id);
    expect((await getLists("book")).map((l) => l.id)).toEqual([books.id]);
    expect(await getLists()).toHaveLength(2);
    expect(await getList(gone.id)).toBeNull();
  });

  it("addToList twice keeps one member", async () => {
    const list = await createList({ name: "Books", kind: "book" });
    await addToList(list.id, dune);
    await addToList(list.id, dune);
    await addToList(list.id, emma);
    expect((await getList(list.id))?.members).toMatchObject([dune, emma]);
    await removeFromList(list.id, "book", dune.id);
    expect((await getList(list.id))?.members).toMatchObject([emma]);
  });

  it("addToList refuses a member whose kind doesn't match the list", async () => {
    const books = await createList({ name: "Books", kind: "book" });
    const authors = await createList({ name: "Authors", kind: "author" });
    await expect(addToList(books.id, austen)).rejects.toThrow();
    await expect(addToList(authors.id, dune)).rejects.toThrow();
    await expect(addToList(authors.id, emma)).rejects.toThrow();
    await addToList(authors.id, austen);
    expect((await getList(authors.id))?.members).toMatchObject([austen]);
  });

  it("deleteList tombstones and blanks members", async () => {
    const list = await createList({ name: "Private", description: "secret", kind: "book" });
    await addToList(list.id, dune);
    await deleteList(list.id);
    const [stored] = await getAllLists();
    expect(stored).toMatchObject({ id: list.id, members: [], description: "" });
    expect(stored.deletedAt).toBeTypeOf("number");
    expect(stored.updatedAt).toBeGreaterThanOrEqual(list.updatedAt);
  });

  it("concurrent addToList calls both land", async () => {
    const list = await createList({ name: "Books", kind: "book" });
    await Promise.all([addToList(list.id, dune), addToList(list.id, emma)]);
    expect((await getList(list.id))?.members.map((m) => m.id)).toEqual(expect.arrayContaining([dune.id, emma.id]));
  });
});
