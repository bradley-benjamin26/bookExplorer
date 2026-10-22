import { describe, expect, it } from "vitest";
import { openLibraryUrl, parseSchemeUrl, schemeUrl, shareMessage } from "./share";
import { routes } from "./navigation";

describe("schemeUrl / parseSchemeUrl round-trip", () => {
  const cases = [
    ["book", routes.book("9780306406157"), ["book", "9780306406157"], {}],
    ["author", routes.author("OL23919A"), ["author", "OL23919A"], {}],
    ["subject with punctuation", routes.subject("fiction,_(general)/x"), ["subject", "fiction,_(general)/x"], {}],
    ["work", routes.work("OL1W"), ["work", "OL1W"], {}],
    ["work highlight", routes.work("OL1W", { highlight: "editions" }), ["work", "OL1W"], { highlight: "editions" }],
    ["graph", routes.graph("subject", "science fiction"), ["graph", "subject", "science fiction"], {}],
    ["saved", routes.saved(), ["saved"], {}],
    ["search", routes.search("dune & co"), ["search"], { q: "dune & co" }],
    ["search empty", routes.search(), ["search"], {}],
  ] as const;

  it.each(cases)("%s", (_name, href, segments, params) => {
    const url = schemeUrl(href);
    expect(url.startsWith("bookexplorer://")).toBe(true);
    expect(parseSchemeUrl(url)).toEqual({ segments, params });
  });
});

describe("shareMessage", () => {
  it("lists title, deep link and Open Library page", () => {
    expect(shareMessage("Dune", routes.book("123"), openLibraryUrl.book("123"))).toBe(
      "Dune\nbookexplorer://book/123\nhttps://openlibrary.org/isbn/123"
    );
  });
});
