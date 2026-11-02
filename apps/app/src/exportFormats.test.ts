import { describe, expect, it } from "vitest";
import { exportFileInfo } from "./exportFormats";

describe("exportFileInfo", () => {
  it("names the JSON backup", () => {
    expect(exportFileInfo("json", "2026-11-01")).toEqual({ name: "book-explorer-2026-11-01.json", mime: "application/json" });
  });
  it("names the books CSV", () => {
    expect(exportFileInfo("csv", "2026-11-01")).toEqual({ name: "book-explorer-books-2026-11-01.csv", mime: "text/csv" });
  });
});
