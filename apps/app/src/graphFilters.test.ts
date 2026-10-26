import type { Graph } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { applyGraphFilter, filterFromParams, filterToParams, shouldAutoOpenList, toggle } from "./graphFilters";

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
    expect(applyGraphFilter(graph, { hiddenTypes: [], hiddenRelations: [] })).toBe(graph);
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

  it("drops islands cut off from the centre", () => {
    const out = applyGraphFilter(graph, { hiddenTypes: [], hiddenRelations: ["notableWork"] });
    expect(out.nodes.map((x) => x.id)).toEqual(["author:a", "author:b"]);
    expect(out.edges).toHaveLength(1);
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
    expect(filterToParams({ hiddenTypes: [], hiddenRelations: [] })).toEqual({});
    expect(filterFromParams({})).toEqual({ hiddenTypes: [], hiddenRelations: [] });
  });

  it("accepts repeated keys without throwing", () => {
    expect(filterFromParams({ hideTypes: ["work", "genre,author"] }).hiddenTypes).toEqual(["work", "genre", "author"]);
  });

  it("toggle adds then removes", () => {
    expect(toggle(toggle([], "a"), "a")).toEqual([]);
  });
});

describe("shouldAutoOpenList", () => {
  it.each([
    ["ios", true, false, true],
    ["android", true, false, true],
    ["web", true, false, false], // RN Web always reports a screen reader
    ["ios", false, false, false],
    ["ios", true, true, false], // the user already picked a view
  ])("%s, reader %s, chosen %s -> %s", (os, reader, chosen, expected) => {
    expect(shouldAutoOpenList(os, reader, chosen)).toBe(expected);
  });
});
