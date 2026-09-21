import { describe, expect, it } from "vitest";
import { combineRatings } from "./ratings.js";

describe("combineRatings", () => {
  it("returns null when given no inputs", () => {
    expect(combineRatings(null, undefined)).toBeNull();
  });

  it("drops a zero-count source instead of treating it as a 0-star vote", () => {
    const result = combineRatings(
      { average: 5, count: 10, source: "hardcover" },
      { average: 0, count: 0, source: "openLibrary" }
    );
    expect(result).toEqual({ average: 5, count: 10, sources: ["hardcover"] });
  });

  it("returns null when every input has a zero count", () => {
    expect(combineRatings({ average: 4, count: 0, source: "hardcover" })).toBeNull();
  });

  it("passes a single source's rating through unchanged", () => {
    expect(combineRatings({ average: 4.2, count: 100, source: "hardcover" })).toEqual({
      average: 4.2,
      count: 100,
      sources: ["hardcover"],
    });
  });

  it("weights the blended average by each source's count rather than averaging the averages", () => {
    // 3000 ratings at 4.0 and 12 at 2.0 should land close to 4.0, not at the naive midpoint 3.0.
    const result = combineRatings(
      { average: 4.0, count: 3000, source: "hardcover" },
      { average: 2.0, count: 12, source: "openLibrary" }
    );
    expect(result?.count).toBe(3012);
    expect(result?.average).toBeCloseTo((4.0 * 3000 + 2.0 * 12) / 3012, 5);
    expect(result?.sources).toEqual(["hardcover", "openLibrary"]);
  });
});
