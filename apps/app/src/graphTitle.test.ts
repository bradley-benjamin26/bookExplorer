import { describe, expect, it } from "vitest";
import { exploringTitle } from "./graphTitle";

describe("exploringTitle", () => {
  it("names the centred node", () => expect(exploringTitle("Dune")).toBe("Exploring Dune"));
  it("falls back before data loads", () => expect(exploringTitle(undefined)).toBe("Explore Graph"));
});
