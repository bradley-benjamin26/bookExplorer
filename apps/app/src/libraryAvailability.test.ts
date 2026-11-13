import { expect, it } from "vitest";
import type { LibraryAvailability } from "@book-explorer/shared";
import { availabilityLine } from "./libraryAvailability";

type Status = LibraryAvailability["copies"][number]["status"];
const copy = (status: Status, dueDate: string | null = null) => ({ branch: "Main", callNumber: null, status, dueDate });
const avail = (copies: LibraryAvailability["copies"]): LibraryAvailability => ({ found: true, level: "availability", copies });

it("is null when not found", () => {
  expect(availabilityLine({ found: false, level: "availability", copies: [] })).toBeNull();
});
it("only claims the catalog for a catalog-level hit", () => {
  expect(availabilityLine({ found: true, level: "catalog", copies: [] })).toBe("In the catalog");
});
it("counts available copies", () => {
  const copies = [...Array(3).fill(0).map(() => copy("available")), ...Array(12).fill(0).map(() => copy("checkedOut"))];
  expect(availabilityLine(avail(copies))).toBe("3 of 15 copies available");
});
it("does not count unknown copies as available", () => {
  expect(availabilityLine(avail([copy("available"), copy("unknown"), copy("unavailable")]))).toBe("1 of 3 copies available");
});
it("shows the earliest due date when none are available", () => {
  expect(availabilityLine(avail([copy("checkedOut", "2026-12-02"), copy("checkedOut", "2026-11-25"), copy("unknown")]))).toBe(
    "No copies on the shelf. Next due Nov 25",
  );
});
it("omits the due date when there is none", () => {
  expect(availabilityLine(avail([copy("checkedOut"), copy("unknown")]))).toBe("No copies on the shelf");
});
