import { describe, expect, it } from "vitest";
import { seriesRowLabel } from "./seriesLabel";

describe("seriesRowLabel", () => {
  it("is null outside a series", () => {
    expect(seriesRowLabel("Dune")).toBeNull();
  });

  it("includes position, and a you-are-here suffix for the current book", () => {
    expect(seriesRowLabel("Dune", { position: "1", current: false })).toBe("Book 1, Dune");
    expect(seriesRowLabel("Dune", { position: "2.5", current: true })).toBe("Book 2.5, Dune, you are here");
  });

  it("omits a missing position", () => {
    expect(seriesRowLabel("Dune", { position: null, current: true })).toBe("Dune, you are here");
  });
});
