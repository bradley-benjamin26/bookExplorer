import type { Graph } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { CENTER_NODE_RADIUS, CONTROLS_GUTTER, clampOffset, clampPoint, createDragSimulation, entryPositions, fitScale, hitNode, labelOpacity, labelWidthOf, layoutGraph, MAX_SCALE, MIN_SCALE, NODE_RADIUS, wrapLabel, zoomAt } from "./graphLayout";

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

  it("breaks after -> without adding spaces", () => {
    expect(wrapLabel("Fiction->Historical->Medieval")).toEqual(["Fiction->", "Historical->", "Medieval"]);
    expect(wrapLabel("A->B")).toEqual(["A->B"]);
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

  it("content box holds every node's clearance", () => {
    // The 3-work graph is a case where nothing needs shifting yet a node's label overruns the viewport-sized box.
    const small = { ...graph, nodes: graph.nodes.slice(0, 4), edges: graph.edges.slice(0, 3) };
    for (const g of [graph, small]) {
      const { nodes, contentWidth: width, contentHeight: height } = layoutGraph(g, 400, 600);
      for (const p of nodes) expect(clampPoint(p, { width, height })).toEqual({ x: p.x, y: p.y });
    }
  });
  it("hitNode finds the node under the point, topmost first", () => {
    const pts = [{ x: 0, y: 0, r: 10 }, { x: 5, y: 0, r: 10 }];
    expect(hitNode(pts, 4, 0)).toBe(1);
    expect(hitNode(pts, 50, 50)).toBe(-1);
  });
  it("clampPoint keeps a point inside the content box", () => {
    expect(clampPoint({ x: -500, y: -500 }, { width: 400, height: 600 })).toEqual({ x: 60, y: CENTER_NODE_RADIUS });
  });
  it("entryPositions starts at the origin, ends at the layout, eases out", () => {
    const final = [{ x: 100, y: 0 }];
    expect(entryPositions(final, { x: 0, y: 0 }, 0)).toEqual([{ x: 0, y: 0 }]);
    expect(entryPositions(final, { x: 0, y: 0 }, 1)).toEqual([{ x: 100, y: 0 }]);
    expect(entryPositions(final, { x: 0, y: 0 }, 0.5)[0].x).toBeCloseTo(87.5);
  });
  it("dragging a node pulls its neighbour along and never moves the center", () => {
    const g = { ...graph, edges: [...graph.edges, { source: "work:OL0W", target: "work:OL1W", relation: "sequel" }] };
    const { nodes, edges, contentWidth: width, contentHeight: height } = layoutGraph(g, 400, 600);
    const sim = createDragSimulation(nodes, edges, { width, height }, g.centerId);
    const center = nodes.find((n) => n.id === g.centerId)!;
    const dragged = nodes.find((n) => n.id === "work:OL1W")!;
    const neighbour = nodes.find((n) => n.id === "work:OL0W")!;
    const before = { cx: center.x, cy: center.y, nx: neighbour.x };
    const dir = Math.sign(dragged.x - before.nx) || 1; // drag away from the neighbour
    Object.assign(dragged, clampPoint({ x: dragged.x + dir * 200, y: dragged.y }, { width, height }));
    dragged.fx = dragged.x; dragged.fy = dragged.y;
    sim.alpha(1); sim.tick(100);
    expect([center.x, center.y]).toEqual([before.cx, before.cy]);
    expect((neighbour.x - before.nx) * dir).toBeGreaterThan(0);
  });
  it("keeps every node inside the content box after a drag to the corner", () => {
    const { nodes, edges, contentWidth: width, contentHeight: height } = layoutGraph(graph, 400, 600);
    const sim = createDragSimulation(nodes, edges, { width, height }, graph.centerId);
    const n = nodes[1];
    Object.assign(n, clampPoint({ x: -500, y: -500 }, { width, height }));
    n.fx = n.x; n.fy = n.y;
    sim.alpha(1); sim.tick(300);
    n.fx = n.fy = null;
    while (sim.alpha() >= sim.alphaMin()) sim.tick();
    for (const p of nodes) expect(clampPoint(p, { width, height })).toEqual({ x: p.x, y: p.y });
  });
});

describe("layoutGraph subject labels", () => {
  it("joins subject parts with -> but only title-cases genres", () => {
    const graph: Graph = {
      centerId: "subject:a",
      nodes: [
        { id: "subject:a", type: "subject", label: "Fiction -- Historical", navigable: true },
        { id: "genre:b", type: "genre", label: "science fiction", navigable: true },
      ],
      edges: [{ source: "subject:a", target: "genre:b", relation: "related" }],
    };
    const labels = layoutGraph(graph, 400, 600).nodes.map((n) => n.label);
    expect(labels).toEqual(["Fiction->Historical", "Science Fiction"]);
  });
});

describe("labelWidthOf", () => {
  it("sizes the widest line for the 13px label font", () => {
    expect(labelWidthOf(["abcdefghij", "abc"])).toBeCloseTo(77, 5);
  });
});

describe("initial fit of a real layout", () => {
  const pair: Graph = {
    centerId: "work:OL1W",
    nodes: [
      { id: "work:OL1W", type: "work", label: "Dune", navigable: true },
      { id: "author:OL1A", type: "author", label: "Frank Herbert", navigable: true },
    ],
    edges: [{ source: "author:OL1A", target: "work:OL1W", relation: "wrote" }],
  };

  it("opens a two-node graph unshrunk on a phone", () => {
    const { bounds } = layoutGraph(pair, 390, 600);
    expect(fitScale({ width: 390, height: 600 }, bounds, CONTROLS_GUTTER)).toBe(1);
  });

  it("measures bounds inside the content box", () => {
    const { bounds, contentWidth, contentHeight } = layoutGraph(pair, 390, 600);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(contentWidth);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(contentHeight);
  });
});

describe("fitScale", () => {
  it("shrinks large content to fit inside the gutter", () => {
    expect(fitScale({ width: 390, height: 600 }, { width: 800, height: 800 }, 56)).toBeCloseTo(0.348, 2);
  });

  it("gives 1 for content smaller than the viewport", () => {
    expect(fitScale({ width: 390, height: 600 }, { width: 100, height: 100 }, 56)).toBe(1);
  });

  it("never magnifies a tiny graph", () => {
    expect(fitScale({ width: 2000, height: 2000 }, { width: 60, height: 60 }, CONTROLS_GUTTER)).toBeLessThanOrEqual(1);
  });

  it("never goes below MIN_SCALE", () => {
    expect(fitScale({ width: 390, height: 600 }, { width: 100000, height: 100000 }, 56)).toBe(MIN_SCALE);
  });
});

describe("clampOffset", () => {
  it("keeps content smaller than the viewport inside it", () => {
    expect(clampOffset(-50, 400, 300, 1)).toBe(0);
    expect(clampOffset(150, 400, 300, 1)).toBe(100);
    expect(clampOffset(40, 400, 300, 1)).toBe(40);
  });

  it("keeps content larger than the viewport covering it", () => {
    expect(clampOffset(20, 300, 400, 1)).toBe(0);
    expect(clampOffset(-150, 300, 400, 1)).toBe(-100);
  });
});

describe("zoomAt", () => {
  it("keeps the focal point fixed", () => {
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 2, 100, 50)).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("clamps the scale to [MIN_SCALE, MAX_SCALE]", () => {
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 10, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 0.01, 0, 0).scale).toBe(MIN_SCALE);
  });
});

describe("labelOpacity", () => {
  it("fades labels in between the fade scales", () => {
    expect(labelOpacity(1)).toBe(0);
    expect(labelOpacity(1.3)).toBe(1);
    expect(labelOpacity(1.15)).toBeCloseTo(0.5);
  });
});
