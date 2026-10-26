import { describe, expect, it } from "vitest";
import { openLibraryUrl, schemeUrl, shareFeedback, shareMessage } from "./share";
import { routes } from "./navigation";

describe("schemeUrl", () => {
  it.each([
    [routes.book("9780306406157"), "bookexplorer://book/9780306406157"],
    [routes.subject("fiction,_(general)/x"), "bookexplorer://subject/fiction%2C_(general)%2Fx"],
    [routes.work("OL1W", { highlight: "editions" }), "bookexplorer://work/OL1W?highlight=editions"],
    [routes.graph("author", "OL1A", { hideTypes: "work,genre" }), "bookexplorer://graph/author/OL1A?hideTypes=work%2Cgenre"],
    [routes.saved(), "bookexplorer://saved"],
    [routes.search("dune & co"), "bookexplorer://search?q=dune+%26+co"],
  ])("%j", (href, url) => expect(schemeUrl(href)).toBe(url));
});

describe("shareMessage", () => {
  it("lists title, deep link and Open Library page", () => {
    expect(shareMessage("Dune", routes.book("123"), openLibraryUrl.book("123"))).toBe(
      "Dune\nbookexplorer://book/123\nhttps://openlibrary.org/isbn/123"
    );
  });
});

describe("shareFeedback", () => {
  it("confirms a copy, stays quiet for a share sheet or a dismissal, and reports other failures", async () => {
    expect(await shareFeedback(async () => true)).toBe("Link copied");
    expect(await shareFeedback(async () => false)).toBe("");
    expect(await shareFeedback(() => Promise.reject(new DOMException("dismissed", "AbortError")))).toBe("");
    expect(await shareFeedback(() => Promise.reject(new Error("NotAllowedError")))).toBe("Couldn't share");
  });
});
