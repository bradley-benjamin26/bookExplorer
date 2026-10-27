import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { applyListChanges, deleteListAndUnsave, listChanges } from "./listMembership";
import { getSavedItems } from "./savedItems";
import { addToList, createList, getList, type SavedList } from "./savedLists";
import { getSavedWork, saveWorkFromApi, updateSavedWork } from "./savedWorks";
import type { Work } from "@book-explorer/shared";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const emma = { type: "work" as const, id: "OL1W", title: "Emma" };
const work = { openLibraryWorkId: "OL1W", title: "Emma", authors: [], subjects: [], genres: [] } as unknown as Work;

async function savedEmma() {
  await saveWorkFromApi(work);
  await updateSavedWork("OL1W", { notes: "keep me" });
}

describe("listMembership", () => {
  beforeEach(() => AsyncStorage.clear());

  it("listChanges diffs checked ids against current membership", () => {
    const l = (id: string, held: boolean) => ({ id, members: held ? [emma] : [] }) as unknown as SavedList;
    expect(listChanges([l("a", true), l("b", false), l("c", true)], emma, new Set(["b", "c"]))).toEqual({ add: ["b"], remove: ["a"] });
  });

  it("applyListChanges saves on add and unsaves after removal from the last list", async () => {
    const a = await createList({ name: "A", kind: "book" });
    const save = vi.fn(() => saveWorkFromApi(work));
    await applyListChanges(emma, { add: [a.id], remove: [] }, save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(await getSavedWork("OL1W")).not.toBeNull();
    await applyListChanges(emma, { add: [], remove: [a.id] }, save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(await getSavedWork("OL1W")).toBeNull();
  });

  it("moving between lists keeps the record", async () => {
    const a = await createList({ name: "A", kind: "book" });
    const b = await createList({ name: "B", kind: "book" });
    await savedEmma();
    await addToList(a.id, emma);
    await applyListChanges(emma, { add: [b.id], remove: [a.id] }, () => saveWorkFromApi(work));
    expect((await getSavedWork("OL1W"))?.notes).toBe("keep me");
    expect((await getList(b.id))?.members).toHaveLength(1);
    expect((await getList(a.id))?.members).toHaveLength(0);
  });

  it("removing from one of two lists keeps the record", async () => {
    const a = await createList({ name: "A", kind: "book" });
    const b = await createList({ name: "B", kind: "book" });
    await savedEmma();
    await addToList(a.id, emma);
    await addToList(b.id, emma);
    await applyListChanges(emma, { add: [], remove: [a.id] }, () => saveWorkFromApi(work));
    expect((await getSavedWork("OL1W"))?.notes).toBe("keep me");
  });

  it("deleteListAndUnsave unsaves members on no other list only", async () => {
    const a = await createList({ name: "A", kind: "book" });
    const b = await createList({ name: "B", kind: "book" });
    const other = { type: "work" as const, id: "OL2W", title: "Persuasion" };
    await savedEmma();
    await saveWorkFromApi({ ...work, openLibraryWorkId: "OL2W", title: "Persuasion" });
    await addToList(a.id, emma);
    await addToList(a.id, other);
    await addToList(b.id, emma);
    await deleteListAndUnsave(a.id);
    expect(await getSavedWork("OL1W")).not.toBeNull();
    expect(await getSavedWork("OL2W")).toBeNull();
    expect(await getList(a.id)).toBeNull();
    expect(await getSavedItems()).toEqual([]); // never went through ensureSaved, so only the records matter
  });
});
