import { describe, expect, it } from "vitest";
import type { SupportedLibrary } from "@book-explorer/shared";
import type { Library } from "./storage/librarySettings";
import { supportedLibraryOptions } from "./libraryOptions";

const supported: SupportedLibrary[] = [
  { id: "a", name: "A", level: "availability" },
  { id: "b", name: "B", level: "catalog" },
  { id: "c", name: "C", level: "catalog" },
];
const lib = (z3950Id?: string): Library => ({ id: "x", name: "n", isbnUrl: "", titleUrl: "", updatedAt: 0, z3950Id }) as Library;

describe("supportedLibraryOptions", () => {
  it("omits libraries already added, keeping registry order", () =>
    expect(supportedLibraryOptions(supported, [lib("b"), lib()]).map((s) => s.id)).toEqual(["a", "c"]));
  it("returns all for an empty list", () => expect(supportedLibraryOptions(supported, [])).toEqual(supported));
});
