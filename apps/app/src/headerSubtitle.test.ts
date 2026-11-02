import { describe, expect, it } from "vitest";
import { headerSubtitle } from "./headerSubtitle";

describe("headerSubtitle", () => {
  it.each(["Settings", "Lists", "Import & Export", "Recommendations", "My Library", "About", "My Hardcover Account"])(
    "keeps the title for the utility page %s",
    (title) => {
      expect(headerSubtitle(title)).toBe(title);
    },
  );

  it.each(["Book", "Work", "Author", "Subject", "List", "Explore Graph", "Search", "Shelf Thread"])(
    "drops the title for %s",
    (title) => {
      expect(headerSubtitle(title)).toBeNull();
    },
  );
});
