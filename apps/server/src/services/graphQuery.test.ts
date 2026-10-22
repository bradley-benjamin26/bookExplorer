import type { GraphEdge, GraphNode } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { findPath, type Neighbours, type PathLimits } from "./graphQuery.js";

const LIMITS: PathLimits = { maxDepth: 4, maxVisited: 300, maxExpansions: 40, timeBudgetMs: 1000, concurrency: 2 };

// Builds a neighbours function from an edge list, the way the graph builders
// return each node's one-hop graph (the node itself plus everything it touches).
function fixture(edges: [string, string, string][]): Neighbours & { calls: string[] } {
  const all: GraphEdge[] = edges.map(([source, relation, target]) => ({ source, relation, target }));
  const node = (id: string): GraphNode => ({ id, type: id.split(":")[0] as GraphNode["type"], label: id, navigable: true });
  const calls: string[] = [];
  const fn = async (id: string) => {
    calls.push(id);
    const touching = all.filter((e) => e.source === id || e.target === id);
    const ids = new Set([id, ...touching.flatMap((e) => [e.source, e.target])]);
    return { nodes: [...ids].map(node), edges: touching };
  };
  return Object.assign(fn, { calls });
}

describe("findPath", () => {
  it("finds the shortest path, keeping each edge's own direction", async () => {
    const graph = fixture([
      ["author:A", "wrote", "work:W1"],
      ["work:W1", "subject", "subject:s"],
      ["work:W2", "subject", "subject:s"],
      // A longer route that must lose to the one above.
      ["author:A", "wrote", "work:X1"],
      ["work:X1", "genre", "genre:g"],
      ["work:X2", "genre", "genre:g"],
      ["work:X2", "subject", "subject:t"],
      ["work:W2", "subject", "subject:t"],
    ]);
    const result = await findPath("author:A", "work:W2", graph, LIMITS);
    expect(result).toEqual({
      found: true,
      nodes: ["author:A", "work:W1", "subject:s", "work:W2"].map((id) => expect.objectContaining({ id })),
      edges: [
        { source: "author:A", relation: "wrote", target: "work:W1" },
        { source: "work:W1", relation: "subject", target: "subject:s" },
        { source: "work:W2", relation: "subject", target: "subject:s" },
      ],
    });
  });

  it("finds a direct neighbour", async () => {
    const graph = fixture([["author:A", "wrote", "work:W"]]);
    const result = await findPath("work:W", "author:A", graph, LIMITS);
    expect(result.found && result.nodes.map((n) => n.id)).toEqual(["work:W", "author:A"]);
  });

  it("reports noPath when the two ends are in separate components", async () => {
    const graph = fixture([
      ["author:A", "wrote", "work:W1"],
      ["author:B", "wrote", "work:W2"],
    ]);
    expect(await findPath("author:A", "author:B", graph, LIMITS)).toEqual({ found: false, reason: "noPath" });
  });

  it("reports noPath when an end can't be expanded", async () => {
    expect(await findPath("author:A", "work:W", async () => null, LIMITS)).toEqual({ found: false, reason: "noPath" });
  });

  it("terminates on a cycle and still finds the path through it", async () => {
    const graph = fixture([
      ["author:A", "wrote", "work:W1"],
      ["work:W1", "subject", "subject:s"],
      ["subject:s", "hasBook", "work:W2"],
      ["work:W2", "author", "author:A"],
      ["subject:s", "broader", "subject:t"],
    ]);
    const result = await findPath("author:A", "subject:t", graph, LIMITS);
    expect(result.found && result.nodes.map((n) => n.id)).toEqual(["author:A", "work:W1", "subject:s", "subject:t"]);
    // Every node is expanded at most once despite the cycle.
    expect(new Set(graph.calls).size).toBe(graph.calls.length);
  });

  it("reports depthCap when the only path is longer than the cap", async () => {
    const chain = fixture([
      ["work:1", "r", "work:2"],
      ["work:2", "r", "work:3"],
      ["work:3", "r", "work:4"],
      ["work:4", "r", "work:5"],
      ["work:5", "r", "work:6"],
    ]);
    expect(await findPath("work:1", "work:6", chain, LIMITS)).toEqual({ found: false, reason: "depthCap" });
    expect((await findPath("work:1", "work:5", chain, LIMITS)).found).toBe(true);
  });

  it("reports nodeCap when the neighbourhood grows past the visited cap", async () => {
    const wide = fixture(Array.from({ length: 20 }, (_, i): [string, string, string] => ["author:A", "wrote", `work:${i}`]));
    const result = await findPath("author:A", "author:Z", wide, { ...LIMITS, maxVisited: 10 });
    expect(result).toEqual({ found: false, reason: "nodeCap" });
  });

  it("reports nodeCap before running more expansions than allowed", async () => {
    const wide = fixture(
      Array.from({ length: 20 }, (_, i): [string, string, string] => [i % 2 ? "author:A" : "author:Z", "wrote", `work:${i}`])
    );
    const result = await findPath("author:A", "author:Z", wide, { ...LIMITS, maxExpansions: 5 });
    expect(result).toEqual({ found: false, reason: "nodeCap" });
    expect(wide.calls.length).toBeLessThanOrEqual(5);
  });

  it("reports timeout when expansions outrun the time budget", async () => {
    const never: Neighbours = () => new Promise(() => {});
    expect(await findPath("author:A", "work:W", never, { ...LIMITS, timeBudgetMs: 20 })).toEqual({
      found: false,
      reason: "timeout",
    });
  });

  it("never runs more expansions at once than the concurrency limit", async () => {
    const wide = fixture(Array.from({ length: 8 }, (_, i): [string, string, string] => ["author:A", "wrote", `work:${i}`]));
    let running = 0;
    let peak = 0;
    const tracked: Neighbours = async (id) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return wide(id);
    };
    await findPath("author:A", "author:Z", tracked, LIMITS);
    expect(peak).toBeLessThanOrEqual(LIMITS.concurrency);
  });
});
