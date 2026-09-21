import { describe, expect, it } from "vitest";
import { mergeLabelLists, parseModsRecord } from "./loc.js";

describe("parseModsRecord", () => {
  const isbn = "9780061120084";

  function record(body: string, recordIsbn = isbn): string {
    return `<mods><identifier type="isbn">${recordIsbn}</identifier>${body}</mods>`;
  }

  it("returns empty metadata when the record's own identifier doesn't match the searched ISBN", () => {
    // The SRU index isn't a strict equality match, so an unrelated record can come back for a bad ISBN.
    const xml = record(`<subject authority="lcsh"><topic>Fiction</topic></subject>`, "0000000000000");
    expect(parseModsRecord(xml, isbn)).toEqual({ subjects: [], genres: [] });
  });

  it("extracts an lcsh subject heading, joining its parts with ' -- '", () => {
    const xml = record(
      `<subject authority="lcsh"><topic>Electronic data processing</topic><topic>Moral and ethical aspects</topic></subject>`
    );
    expect(parseModsRecord(xml, isbn).subjects).toEqual(["Electronic data processing -- Moral and ethical aspects"]);
  });

  it("ignores a subject block whose authority isn't lcsh", () => {
    const xml = record(`<subject authority="local"><topic>Some local term</topic></subject>`);
    expect(parseModsRecord(xml, isbn).subjects).toEqual([]);
  });

  it("extracts a gsafd genre term and strips its trailing period", () => {
    const xml = record(`<genre authority="gsafd">Mystery fiction.</genre>`);
    expect(parseModsRecord(xml, isbn).genres).toEqual(["Mystery fiction"]);
  });

  it("still matches a gsafd genre element whose attributes are in a different order", () => {
    // Regression test: this regex used to hardcode `<genre authority="gsafd"` as a literal
    // prefix, so a record ordering the element's attributes differently silently matched nothing.
    const xml = record(`<genre type="form" authority="gsafd">Science fiction.</genre>`);
    expect(parseModsRecord(xml, isbn).genres).toEqual(["Science fiction"]);
  });

  it("ignores a genre element tagged with a non-gsafd authority", () => {
    const xml = record(`<genre authority="lcgft">Fiction.</genre>`);
    expect(parseModsRecord(xml, isbn).genres).toEqual([]);
  });

  it("deduplicates repeated genre terms", () => {
    const xml = record(`<genre authority="gsafd">Mystery fiction.</genre><genre authority="gsafd">Mystery fiction.</genre>`);
    expect(parseModsRecord(xml, isbn).genres).toEqual(["Mystery fiction"]);
  });

  it("decodes XML entities in subject and genre text", () => {
    const xml = record(
      `<subject authority="lcsh"><topic>Rock &amp; roll</topic></subject><genre authority="gsafd">Horror &amp; suspense fiction.</genre>`
    );
    const result = parseModsRecord(xml, isbn);
    expect(result.subjects).toEqual(["Rock & roll"]);
    expect(result.genres).toEqual(["Horror & suspense fiction"]);
  });
});

describe("mergeLabelLists", () => {
  it("deduplicates case-insensitively, keeping the first-seen spelling", () => {
    expect(mergeLabelLists(["Fiction", "Mystery"], ["fiction", "Science Fiction"])).toEqual([
      "Fiction",
      "Mystery",
      "Science Fiction",
    ]);
  });

  it("drops blank/whitespace-only labels", () => {
    expect(mergeLabelLists(["Fiction", "  ", ""], ["Mystery"])).toEqual(["Fiction", "Mystery"]);
  });

  it("preserves earlier lists' ordering ahead of later lists' new entries", () => {
    expect(mergeLabelLists(["B", "A"], ["C", "A"])).toEqual(["B", "A", "C"]);
  });

  it("returns an empty array when given no lists or only empty lists", () => {
    expect(mergeLabelLists()).toEqual([]);
    expect(mergeLabelLists([], [])).toEqual([]);
  });
});
