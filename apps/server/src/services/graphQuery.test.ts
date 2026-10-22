import type { GraphEdge, GraphNode } from "@book-explorer/shared";
import { describe, expect, it, vi } from "vitest";
import type { PathResult } from "@book-explorer/shared";
import { findPath, graphNeighbours, summarise, type Neighbours, type PathLimits } from "./graphQuery.js";
import { buildSubjectBooksGraph, buildSubjectGraph, buildWorkGraph } from "./graphService.js";

vi.mock("./graphService.js", () => ({
  buildAuthorGraph: vi.fn(),
  buildSubjectGraph: vi.fn(),
  buildSubjectBooksGraph: vi.fn(),
  buildWorkGraph: vi.fn(),
}));

const LIMITS: PathLimits = { maxDepth: 4, maxVisited: 300, maxExpansions: 40, timeBudgetMs: 1000, concurrency: 2 };

// Builds a neighbours function from an edge list, the way the graph builders
// return each node's one-hop graph (the node itself plus everything it touches),
// with a subject's Open Library work count when `workCounts` names it.
function fixture(edges: [string, string, string][], workCounts: Record<string, number> = {}): Neighbours & { calls: string[] } {
  const all: GraphEdge[] = edges.map(([source, relation, target]) => ({ source, relation, target }));
  const node = (id: string): GraphNode => ({ id, type: id.split(":")[0] as GraphNode["type"], label: id, navigable: true });
  const calls: string[] = [];
  const fn = async (id: string) => {
    calls.push(id);
    const touching = all.filter((e) => e.source === id || e.target === id);
    const ids = new Set([id, ...touching.flatMap((e) => [e.source, e.target])]);
    return { nodes: [...ids].map(node), edges: touching, workCount: workCounts[id] };
  };
  return Object.assign(fn, { calls });
}

const pathIds = (result: PathResult, i = 0) => (result.found ? result.paths[i]?.nodes.map((n) => n.id) : null);

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
      paths: [
        {
          nodes: ["author:A", "work:W1", "subject:s", "work:W2"].map((id) => expect.objectContaining({ id })),
          edges: [
            { source: "author:A", relation: "wrote", target: "work:W1" },
            { source: "work:W1", relation: "subject", target: "subject:s" },
            { source: "work:W2", relation: "subject", target: "subject:s" },
          ],
          summary: "Via work:W1 → subject:s",
        },
      ],
    });
  });

  it("finds a direct neighbour", async () => {
    const graph = fixture([["author:A", "wrote", "work:W"]]);
    const result = await findPath("work:W", "author:A", graph, LIMITS);
    expect(pathIds(result)).toEqual(["work:W", "author:A"]);
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
    expect(result.found && result.paths.map((p) => p.nodes.map((n) => n.id))).toContainEqual(["author:A", "work:W1", "subject:s", "subject:t"]);
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

  it("treats a failed expansion as a dead end and finds the path another way", async () => {
    const graph = fixture([
      ["author:A", "wrote", "work:Bad"],
      ["author:A", "wrote", "work:W1"],
      ["work:W1", "subject", "subject:s"],
      ["subject:s", "hasBook", "work:T"],
      ...Array.from({ length: 5 }, (_, i): [string, string, string] => ["work:T", "genre", `genre:${i}`]),
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing: Neighbours = (id) => (id === "work:Bad" ? Promise.reject(new Error("upstream down")) : graph(id));
    const result = await findPath("author:A", "work:T", failing, LIMITS);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(pathIds(result)).toEqual(["author:A", "work:W1", "subject:s", "work:T"]);
  });

  it("starts no queued expansions once the time budget has run out", async () => {
    const wide = fixture(
      Array.from({ length: 16 }, (_, i): [string, string, string] => [i % 2 ? "author:A" : "author:Z", "wrote", `work:${i}`])
    );
    const slow: Neighbours = async (id) => {
      const hood = await wide(id);
      if (id.startsWith("work:")) await new Promise((r) => setTimeout(r, 30));
      return hood;
    };
    const result = await findPath("author:A", "author:Z", slow, { ...LIMITS, timeBudgetMs: 15 });
    expect(result).toEqual({ found: false, reason: "timeout" });
    await new Promise((r) => setTimeout(r, 100));
    // Both authors, then only the first batch of works already running at the deadline.
    expect(wide.calls.length).toBeLessThanOrEqual(2 + LIMITS.concurrency);
  });

  it("reaches a 4-edge author -> other work -> specific subject <- target path where level-by-level BFS hits the cap", async () => {
    // Each end also has ten broad subjects of twelve books each. Plain BFS
    // expands both ends' whole first ring (2 + 11 + 11 = 24 expansions) before
    // it can meet, so it reports nodeCap at 16; best-first opens the author first.
    const broad = (end: string, prefix: string) =>
      Array.from({ length: 10 }, (_, i): [string, string, string][] => [
        [end, "subject", `subject:${prefix}${i}`],
        ...Array.from({ length: 12 }, (_, j): [string, string, string] => [`work:${prefix}${i}-${j}`, "subject", `subject:${prefix}${i}`]),
      ]).flat();
    const counts = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [[`subject:b${i}`, 1e6], [`subject:c${i}`, 1e6]]).flat());
    const graph = fixture(
      [
        ["author:A", "wrote", "work:W1"],
        ["author:A", "wrote", "work:W3"],
        ["work:W3", "subject", "subject:s"],
        ["work:W2", "subject", "subject:s"],
        ...broad("work:W1", "b"),
        ...broad("work:W2", "c"),
      ],
      { ...counts, "subject:s": 50 }
    );
    const result = await findPath("work:W1", "work:W2", graph, { ...LIMITS, maxExpansions: 16 });
    expect(pathIds(result)).toEqual(["work:W1", "author:A", "work:W3", "subject:s", "work:W2"]);
    expect(graph.calls.length).toBeLessThanOrEqual(16);
  });

  it("ranks a path through a specific subject above one through a generic subject", async () => {
    const graph = fixture(
      [
        ["work:W1", "subject", "subject:fiction"],
        ["work:W2", "subject", "subject:fiction"],
        ["work:W1", "subject", "subject:tudor_england"],
        ["work:W2", "subject", "subject:tudor_england"],
      ],
      { "subject:fiction": 1_000_000, "subject:tudor_england": 300 }
    );
    const result = await findPath("work:W1", "work:W2", graph, LIMITS);
    expect(result.found && result.paths.map((p) => p.summary)).toEqual(["Both: subject:tudor_england", "Both: subject:fiction"]);
  });

  it("returns at most three distinct paths, most specific first", async () => {
    const counts = [10, 100_000, 100, 1_000_000, 1000];
    const graph = fixture(
      counts.flatMap((_, i): [string, string, string][] => [
        ["work:W1", "subject", `subject:s${i}`],
        ["work:W2", "subject", `subject:s${i}`],
      ]),
      Object.fromEntries(counts.map((c, i) => [`subject:s${i}`, c]))
    );
    const result = await findPath("work:W1", "work:W2", graph, LIMITS);
    expect(result.found && result.paths.map((p) => p.nodes[1].id)).toEqual(["subject:s0", "subject:s2", "subject:s4"]);
  });

  it("returns the paths found so far when the time budget runs out", async () => {
    const graph = fixture([
      ["work:W1", "subject", "subject:s"],
      ["work:W2", "subject", "subject:s"],
      ["work:W1", "subject", "subject:slow"],
    ]);
    const hanging: Neighbours = (id) => (id === "subject:slow" ? new Promise(() => {}) : graph(id));
    const result = await findPath("work:W1", "work:W2", hanging, { ...LIMITS, timeBudgetMs: 30 });
    expect(pathIds(result)).toEqual(["work:W1", "subject:s", "work:W2"]);
  });

  it("stops starting expansions as soon as the signal aborts", async () => {
    const wide = fixture(Array.from({ length: 16 }, (_, i): [string, string, string] => ["author:A", "wrote", `work:${i}`]));
    const controller = new AbortController();
    const slow: Neighbours = async (id) => {
      if (wide.calls.length === 3) controller.abort();
      const hood = await wide(id);
      await new Promise((r) => setTimeout(r, 5));
      return hood;
    };
    const result = await findPath("author:A", "author:Z", slow, LIMITS, controller.signal);
    expect(result).toEqual({ found: false, reason: "timeout" });
    const callsAtAbort = wide.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(wide.calls.length).toBe(callsAtAbort);
  });
});

describe("summarise", () => {
  const node = (id: string, label: string): GraphNode => ({ id, type: id.split(":")[0] as GraphNode["type"], label, navigable: true });
  it("names a shared author or subject, and otherwise the chain", () => {
    const [w1, w2] = [node("work:1", "Wolf Hall"), node("work:2", "Bring Up the Bodies")];
    expect(summarise([w1, node("author:A", "Hilary Mantel"), w2])).toBe("Same author: Hilary Mantel");
    expect(summarise([w1, node("subject:t", "Tudor England"), w2])).toBe("Both: Tudor England");
    expect(summarise([w1, node("author:A", "Hilary Mantel"), node("subject:t", "Tudor England"), w2])).toBe(
      "Via Hilary Mantel → Tudor England"
    );
  });
});

describe("graphNeighbours", () => {
  it("renames a centre that came back under another id to the id asked for", async () => {
    vi.mocked(buildWorkGraph).mockResolvedValue({
      centerId: "work:OL2W",
      nodes: [
        { id: "work:OL2W", type: "work", label: "Dune", navigable: true },
        { id: "author:OL3A", type: "author", label: "Frank Herbert", navigable: true },
      ],
      edges: [{ source: "author:OL3A", target: "work:OL2W", relation: "author" }],
    });
    const hood = await graphNeighbours("work:OL1W");
    expect(hood?.nodes.map((n) => n.id)).toEqual(["work:OL1W", "author:OL3A"]);
    expect(hood?.edges).toEqual([{ source: "author:OL3A", target: "work:OL1W", relation: "author" }]);
    expect(hood?.workCount).toBeUndefined();
  });

  it("opens a subject or genre as its book list and work count only, without the related-concept lookups", async () => {
    vi.mocked(buildSubjectBooksGraph).mockResolvedValue({
      centerId: "subject:fiction",
      workCount: 900,
      nodes: [{ id: "subject:fiction", type: "subject", label: "Fiction", navigable: true }],
      edges: [],
    });
    const hood = await graphNeighbours("genre:fiction");
    expect(buildSubjectBooksGraph).toHaveBeenCalledWith("fiction");
    expect(buildSubjectGraph).not.toHaveBeenCalled();
    expect(hood).toEqual({ nodes: [expect.objectContaining({ id: "genre:fiction" })], edges: [], workCount: 900 });
  });

  it("does not expand ids that have no graph of their own", async () => {
    expect(await graphNeighbours("author:qid:Q42")).toBeNull();
    expect(await graphNeighbours("editions:OL1W")).toBeNull();
  });
});
