import type { Graph } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { applyGraphFilter, filterFromParams, filterToParams, NO_FILTER, toggle } from "./graphFilters";

const n = (id: string, type: "author" | "work" | "subject") => ({ id, type, label: id, navigable: true });
const graph: Graph = {
  centerId: "author:a",
  nodes: [n("author:a", "author"), n("author:b", "author"), n("work:w", "work"), n("subject:s", "subject")],
  edges: [
    { source: "author:a", target: "author:b", relation: "influencedBy" },
    { source: "author:a", target: "work:w", relation: "notableWork" },
    { source: "work:w", target: "subject:s", relation: "subject" },
  ],
};

describe("applyGraphFilter", () => {
  it("returns the graph untouched with no filter", () => {
    expect(applyGraphFilter(graph, NO_FILTER)).toBe(graph);
  });

  it("removes hidden types and leaves no dangling edges", () => {
    const out = applyGraphFilter(graph, { hiddenTypes: ["work"], hiddenRelations: [] });
    const ids = new Set(out.nodes.map((x) => x.id));
    expect(ids.has("work:w")).toBe(false);
    expect(ids.has("subject:s")).toBe(false); // orphaned by the work removal
    expect(out.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
  });

  it("removes hidden relations and the nodes they orphan", () => {
    const out = applyGraphFilter(graph, { hiddenTypes: [], hiddenRelations: ["influencedBy"] });
    expect(out.nodes.map((x) => x.id)).toEqual(["author:a", "work:w", "subject:s"]);
    expect(out.edges).toHaveLength(2);
  });

  it("never removes the centre node", () => {
    const out = applyGraphFilter(graph, { hiddenTypes: ["author", "work", "subject"], hiddenRelations: [] });
    expect(out.nodes.map((x) => x.id)).toEqual(["author:a"]);
    expect(out.edges).toEqual([]);
  });
});

describe("filter params", () => {
  it("round-trips and omits empty lists", () => {
    const f = { hiddenTypes: ["work", "genre"], hiddenRelations: ["influencedBy"] };
    expect(filterFromParams(filterToParams(f))).toEqual(f);
    expect(filterToParams(NO_FILTER)).toEqual({});
    expect(filterFromParams({})).toEqual(NO_FILTER);
  });

  it("toggle adds then removes", () => {
    expect(toggle(toggle([], "a"), "a")).toEqual([]);
  });
});
