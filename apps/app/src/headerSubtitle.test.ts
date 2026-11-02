import { describe, expect, it } from "vitest";
import { headerSubtitle } from "./headerSubtitle";

describe("headerSubtitle", () => {
  it.each(["Settings", "Lists", "Import & export", "Recommendations", "My Library", "About", "My Hardcover account"])(
    "keeps the title for the utility page %s",
    (title) => {
      expect(headerSubtitle(title)).toBe(title);
    },
  );

  it.each(["Book", "Work", "Author", "Subject", "List", "Explore graph", "Search", "Shelf Thread"])(
    "drops the title for %s",
    (title) => {
      expect(headerSubtitle(title)).toBeNull();
    },
  );
});
