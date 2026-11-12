import { describe, expect, it } from "vitest";
import { coverAlt } from "./coverAlt";

describe("coverAlt", () => {
  it("names one author", () => expect(coverAlt("Dune", ["Frank Herbert"])).toBe("Book cover of Dune by Frank Herbert"));
  it("joins two authors with and", () => expect(coverAlt("Good Omens", ["Terry Pratchett", "Neil Gaiman"])).toBe("Book cover of Good Omens by Terry Pratchett and Neil Gaiman"));
  it("joins three or more with commas then and", () => expect(coverAlt("X", ["A", "B", "C"])).toBe("Book cover of X by A, B and C"));
  it("drops 'by' with no authors", () => expect(coverAlt("Beowulf", [])).toBe("Book cover of Beowulf"));
});
