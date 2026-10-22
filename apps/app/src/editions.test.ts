import { describe, expect, it } from "vitest";
import type { Edition } from "@book-explorer/shared";
import { collapseSelfPublished, isSelfPublished } from "./editions";

const edition = (id: string, publisher: string | null): Edition => ({
  openLibraryEditionId: id,
  isbn: null,
  format: null,
  publisher,
  publishDate: null,
  coverUrl: null,
});

describe("isSelfPublished", () => {
  it("matches CreateSpace and Independently Published imprints, in any case", () => {
    expect(isSelfPublished(edition("a", "CreateSpace Independent Publishing Platform"))).toBe(true);
    expect(isSelfPublished(edition("a", "Independently Published"))).toBe(true);
    expect(isSelfPublished(edition("a", "independently published"))).toBe(true);
  });

  it("does not match ordinary or missing publishers", () => {
    expect(isSelfPublished(edition("a", "Penguin Classics"))).toBe(false);
    expect(isSelfPublished(edition("a", null))).toBe(false);
  });
});

describe("collapseSelfPublished", () => {
  it("leaves editions alone when there are three or fewer self-published ones", () => {
    const editions = [edition("1", "Penguin"), edition("2", "CreateSpace"), edition("3", "Independently Published")];
    expect(collapseSelfPublished(editions)).toEqual({ shown: editions, hiddenCount: 0 });
  });

  it("keeps the first three self-published editions and counts the rest, preserving order", () => {
    const editions = [
      edition("1", "CreateSpace"),
      edition("2", "Penguin"),
      edition("3", "Independently Published"),
      edition("4", "CreateSpace"),
      edition("5", "Independently Published"),
      edition("6", "Dover"),
    ];
    const { shown, hiddenCount } = collapseSelfPublished(editions);
    expect(shown.map((e) => e.openLibraryEditionId)).toEqual(["1", "2", "3", "4", "6"]);
    expect(hiddenCount).toBe(1);
  });
});
