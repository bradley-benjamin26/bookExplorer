import type { Graph } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { CENTER_NODE_RADIUS, layoutGraph, NODE_RADIUS, wrapLabel } from "./graphLayout";

describe("wrapLabel", () => {
  it("keeps a short label on one line", () => {
    expect(wrapLabel("Dune")).toEqual(["Dune"]);
  });

  it("breaks on word boundaries and caps at 3 lines with an ellipsis", () => {
    expect(wrapLabel("Frank Patrick Herbert")).toEqual(["Frank Patrick", "Herbert"]);
    const lines = wrapLabel("alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima");
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith("…")).toBe(true);
  });
});

describe("layoutGraph", () => {
  const graph: Graph = {
    centerId: "author:OL1A",
    nodes: [
      { id: "author:OL1A", type: "author", label: "Frank Herbert", navigable: true },
      ...["Dune", "Dune Messiah", "Children of Dune", "God Emperor of Dune", "Heretics of Dune", "Chapterhouse: Dune"].map(
        (label, i) => ({ id: `work:OL${i}W`, type: "work" as const, label, navigable: true })
      ),
    ],
    edges: Array.from({ length: 6 }, (_, i) => ({ source: "author:OL1A", target: `work:OL${i}W`, relation: "wrote" })),
  };

  it("positions every node without any two overlapping", () => {
    const { nodes, edges, contentWidth, contentHeight } = layoutGraph(graph, 400, 600);
    expect(nodes).toHaveLength(graph.nodes.length);
    expect(edges).toHaveLength(graph.edges.length);
    expect(contentWidth).toBeGreaterThanOrEqual(400);
    expect(contentHeight).toBeGreaterThanOrEqual(600);
    const radius = (id: string) => (id === graph.centerId ? CENTER_NODE_RADIUS : NODE_RADIUS);
    for (let i = 0; i < nodes.length; i++) {
      expect(nodes[i].x).toBeGreaterThanOrEqual(0);
      expect(nodes[i].y).toBeGreaterThanOrEqual(0);
      for (let j = i + 1; j < nodes.length; j++) {
        const gap = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        expect(gap).toBeGreaterThan(radius(nodes[i].id) + radius(nodes[j].id));
      }
    }
  });
});
