import { describe, expect, it } from "vitest";
import { pathAsGraph, pathSteps } from "./graphLabels";

describe("pathSteps", () => {
  it("labels each step with its position, type and relation, read along the edge's direction", () => {
    const steps = pathSteps({
      found: true,
      nodes: [
        { id: "work:OL1W", type: "work", label: "Dune", navigable: true },
        { id: "author:OL2A", type: "author", label: "Frank Herbert", navigable: true },
        { id: "author:OL3A", type: "author", label: "Brian Herbert", navigable: true },
      ],
      edges: [
        { source: "author:OL2A", target: "work:OL1W", relation: "author" },
        { source: "author:OL3A", target: "author:OL2A", relation: "influencedBy" },
      ],
    });
    expect(steps.map((s) => s.relation)).toEqual([
      null,
      "Frank Herbert wrote Dune",
      "Brian Herbert influenced by Frank Herbert",
    ]);
    expect(steps[0].accessibilityLabel).toBe("Step 1 of 3: Dune, Book");
    expect(steps[1].accessibilityLabel).toBe("Step 2 of 3: Frank Herbert, Author. Frank Herbert wrote Dune");
  });
});

describe("pathAsGraph", () => {
  it("centres a found path on its start", () => {
    const nodes = [
      { id: "work:OL1W", type: "work" as const, label: "Dune", navigable: true },
      { id: "author:OL2A", type: "author" as const, label: "Frank Herbert", navigable: true },
    ];
    const edges = [{ source: "author:OL2A", target: "work:OL1W", relation: "author" }];
    expect(pathAsGraph({ found: true, nodes, edges })).toEqual({ centerId: "work:OL1W", nodes, edges });
  });

  it("throws the not-found reason", () => {
    expect(() => pathAsGraph({ found: false, reason: "timeout" })).toThrow("ran out of time");
  });
});
