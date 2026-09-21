import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "@book-explorer/shared";
import { cleanGraph, normalizeTitle } from "./graphService.js";

describe("normalizeTitle", () => {
  it("strips a leading article", () => {
    expect(normalizeTitle("The Cricket in Times Square")).toBe("cricket in times square");
  });

  it("strips a trailing ', The' article", () => {
    expect(normalizeTitle("Old Meadow, The")).toBe("old meadow");
  });

  it("strips a trailing parenthetical subtitle", () => {
    expect(normalizeTitle("The Cricket in Times Square (Chester Cricket and His Friends)")).toBe(
      "cricket in times square"
    );
  });

  it("is case-insensitive and ignores punctuation differences", () => {
    expect(normalizeTitle("Mister Micawber's Debts!")).toBe(normalizeTitle("MISTER MICAWBER'S DEBTS"));
  });

  it("does not collapse titles that share no normalized text (e.g. a translation)", () => {
    expect(normalizeTitle("The Cricket in Times Square")).not.toBe(normalizeTitle("Grillo en Times Square"));
  });
});

describe("cleanGraph", () => {
  function work(id: string, label: string): GraphNode {
    return { id, type: "work", label, navigable: true };
  }
  function author(id: string, label: string): GraphNode {
    return { id, type: "author", label, navigable: true };
  }

  it("collapses same-title work duplicates onto the first-seen node", () => {
    const nodes = [work("work:A", "The Cricket in Times Square"), work("work:B", "Cricket in Times Square")];
    const { nodes: cleaned } = cleanGraph(nodes, []);
    expect(cleaned.map((n) => n.id)).toEqual(["work:A"]);
  });

  it("redirects an edge that pointed at a dropped duplicate to the surviving node", () => {
    const nodes = [
      author("author:X", "Author X"),
      work("work:A", "The Cricket in Times Square"),
      work("work:B", "Cricket in Times Square"),
    ];
    const edges: GraphEdge[] = [{ source: "author:X", target: "work:B", relation: "wrote" }];
    const { edges: cleaned } = cleanGraph(nodes, edges);
    expect(cleaned).toEqual([{ source: "author:X", target: "work:A", relation: "wrote" }]);
  });

  it("drops an edge that becomes a self-loop after redirecting a duplicate", () => {
    const nodes = [work("work:A", "Beowulf"), work("work:B", "Beowulf")];
    const edges: GraphEdge[] = [{ source: "work:A", target: "work:B", relation: "notableWork" }];
    const { edges: cleaned } = cleanGraph(nodes, edges);
    expect(cleaned).toEqual([]);
  });

  it("drops an edge whose endpoint has no matching node", () => {
    const nodes = [author("author:X", "Author X")];
    const edges: GraphEdge[] = [{ source: "author:X", target: "work:missing", relation: "wrote" }];
    const { edges: cleaned } = cleanGraph(nodes, edges);
    expect(cleaned).toEqual([]);
  });

  it("deduplicates identical edges", () => {
    const nodes = [author("author:X", "Author X"), work("work:A", "A Book")];
    const edges: GraphEdge[] = [
      { source: "author:X", target: "work:A", relation: "wrote" },
      { source: "author:X", target: "work:A", relation: "wrote" },
    ];
    const { edges: cleaned } = cleanGraph(nodes, edges);
    expect(cleaned).toHaveLength(1);
  });

  it("does not merge two works with genuinely different titles", () => {
    const nodes = [work("work:A", "The Cricket in Times Square"), work("work:B", "Grillo en Times Square")];
    const { nodes: cleaned } = cleanGraph(nodes, []);
    expect(cleaned.map((n) => n.id).sort()).toEqual(["work:A", "work:B"]);
  });

  it("never merges non-work nodes that happen to share a duplicate id", () => {
    const nodes = [author("author:X", "Author X"), author("author:X", "Author X (dup insert)")];
    const { nodes: cleaned } = cleanGraph(nodes, []);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].label).toBe("Author X");
  });
});
