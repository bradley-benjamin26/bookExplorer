import { describe, expect, it } from "vitest";
import { listCoverUrls } from "./listCovers";
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
