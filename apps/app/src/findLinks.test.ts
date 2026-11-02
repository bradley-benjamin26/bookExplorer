import { expect, it } from "vitest";
import { hardcoverUrl, openLibraryWorkUrl } from "./findLinks";

it("links to the Hardcover book page when there is a slug", () => {
  expect(hardcoverUrl("dune", "x")).toBe("https://hardcover.app/books/dune");
});
it("falls back to a Hardcover search without a slug", () => {
  expect(hardcoverUrl(null, "9780441013593")).toBe("https://hardcover.app/search?q=9780441013593");
  expect(hardcoverUrl(undefined, "a b")).toBe("https://hardcover.app/search?q=a%20b");
});
it("links to an Open Library work", () => {
  expect(openLibraryWorkUrl("OL45883W")).toBe("https://openlibrary.org/works/OL45883W");
});
