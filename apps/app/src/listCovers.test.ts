import { describe, expect, it } from "vitest";
import { listCoverUrls, recentCoverUrl } from "./listCovers";
import type { RecentItem } from "./storage/history";
import type { ListMember } from "./storage/savedLists";

const member = (type: ListMember["type"], id: string): ListMember => ({ type, id, title: id, addedAt: 0 });
const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-S.jpg`;

describe("listCoverUrls", () => {
  it("gives a cover URL per book, in order", () => {
    const members = [member("book", "111"), member("book", "222"), member("book", "333")];
    expect(listCoverUrls(members)).toEqual([cover("111"), cover("222"), cover("333")]);
  });

  it("drops members past the first three", () => {
    const members = ["1", "2", "3", "4"].map((id) => member("book", id));
    expect(listCoverUrls(members)).toHaveLength(3);
  });

  it("gives null for works and authors, which have no ISBN to look up", () => {
    expect(listCoverUrls([member("work", "OL1W"), member("author", "OL2A")])).toEqual([null, null]);
  });

  it("gives an empty list for an empty list", () => {
    expect(listCoverUrls([])).toEqual([]);
  });
});

describe("recentCoverUrl", () => {
  const recent = (kind: RecentItem["kind"], id: string): RecentItem => ({ kind, id, title: null, subtitle: null });

  it("gives the small Open Library cover for a book", () => {
    expect(recentCoverUrl(recent("book", "9780141439518"))).toBe("https://covers.openlibrary.org/b/isbn/9780141439518-S.jpg");
  });

  it("uses the cover the book page showed, shrinking Open Library's to -S", () => {
    const withCover = (coverUrl: string): RecentItem => ({ ...recent("book", "111"), coverUrl });
    expect(recentCoverUrl(withCover("https://covers.openlibrary.org/b/id/42-L.jpg"))).toBe("https://covers.openlibrary.org/b/id/42-S.jpg");
    expect(recentCoverUrl(withCover("https://covers.openlibrary.org/b/id/42-M.jpg"))).toBe("https://covers.openlibrary.org/b/id/42-S.jpg");
    expect(recentCoverUrl(withCover("https://assets.hardcover.app/x.jpg"))).toBe("https://assets.hardcover.app/x.jpg");
  });

  it("falls back to the ISBN cover when none was saved", () => {
    expect(recentCoverUrl({ ...recent("book", "111"), coverUrl: null })).toBe(cover("111"));
  });

  it("gives null for works, authors and subjects", () => {
    for (const kind of ["work", "author", "subject"] as const) expect(recentCoverUrl(recent(kind, "x"))).toBeNull();
  });
});
