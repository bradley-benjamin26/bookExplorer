import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Work } from "@book-explorer/shared";
import AsyncStorage from "../test/asyncStorageMock";
import { getSavedItems } from "./savedItems";
import { getAllSavedWorks, getSavedWork, saveWork, unsaveWork, updateSavedWork } from "./savedWorks";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const work: Work = {
  openLibraryWorkId: "OL66554W",
  title: "Pride and Prejudice",
  authors: [{ openLibraryId: "OL21594A", name: "Jane Austen" }],
  coverUrl: null,
  description: null,
  subjects: [{ label: "Courtship", sources: ["openLibrary"] }],
  genres: [{ label: "Romance", sources: ["openLibrary"] }],
  isbn: null,
  editions: [],
  rating: null,
  reviews: [],
};

describe("savedWorks", () => {
  beforeEach(() => AsyncStorage.clear());

  it("seeds a new record from the work's API tags", async () => {
    expect(await saveWork(work)).toMatchObject({
      openLibraryWorkId: "OL66554W",
      authorNames: ["Jane Austen"],
      subjects: ["Courtship"],
      genres: ["Romance"],
      notes: "",
    });
    expect(await getSavedItems()).toMatchObject([{ type: "work", id: "OL66554W", title: "Pride and Prejudice" }]);
  });

  it("never unsaves and keeps existing notes, including when two saves overlap", async () => {
    await saveWork(work);
    await updateSavedWork(work.openLibraryWorkId, { notes: "loved it" });
    const [a, b] = await Promise.all([saveWork({ ...work, subjects: [] }), saveWork(work)]);
    expect(a.notes).toBe("loved it");
    expect(b.notes).toBe("loved it");
    expect((await getSavedWork(work.openLibraryWorkId))?.subjects).toEqual(["Courtship"]);
    expect(await getSavedItems()).toHaveLength(1);
  });

  it("two first saves at once create one record", async () => {
    await Promise.all([saveWork(work), saveWork(work)]);
    expect(await getAllSavedWorks()).toHaveLength(1);
    expect(await getSavedItems()).toHaveLength(1);
  });

  it("unsaving tombstones the record without its notes and tags, and refuses later edits", async () => {
    await saveWork(work);
    await updateSavedWork(work.openLibraryWorkId, { notes: "private" });
    await unsaveWork(work.openLibraryWorkId);
    expect(await getSavedItems()).toEqual([]);
    expect(await getSavedWork(work.openLibraryWorkId)).toBeNull();
    expect(await updateSavedWork(work.openLibraryWorkId, { notes: "x" })).toBeNull();
    const [raw] = await getAllSavedWorks();
    expect(raw).toMatchObject({ notes: "", subjects: [], genres: [] });
    expect(raw.deletedAt).toBeGreaterThan(0);
    expect((await saveWork(work)).notes).toBe("");
  });
});
