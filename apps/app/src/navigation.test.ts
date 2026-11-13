import { describe, expect, it } from "vitest";
import { memberHref, nodeHref, nodePressHref, routes } from "./navigation";

describe("memberHref", () => {
  it("routes each member type to its screen", () => {
    expect(memberHref({ type: "author", id: "OL1A" })).toEqual(routes.author("OL1A"));
    expect(memberHref({ type: "work", id: "OL2W" })).toEqual(routes.work("OL2W"));
    expect(memberHref({ type: "book", id: "978" })).toEqual(routes.book("978"));
  });
});

describe("routes", () => {
  it("has an About page", () => {
    expect(routes.about()).toBe("/about");
  });

  it("carries a subject's label only when given", () => {
    expect(routes.subject("a_b", "A, B")).toEqual({ pathname: "/subject/[slug]", params: { slug: "a_b", label: "A, B" } });
    expect(routes.subject("a_b")).toEqual({ pathname: "/subject/[slug]", params: { slug: "a_b" } });
  });
});

describe("routes.award", () => {
  it("carries the slug and, when given, the label", () => {
    expect(routes.award("hugo_award", "Hugo Award")).toEqual({ pathname: "/award/[slug]", params: { slug: "hugo_award", label: "Hugo Award" } });
    expect(routes.award("hugo_award")).toEqual({ pathname: "/award/[slug]", params: { slug: "hugo_award" } });
  });
});

describe("nodeHref", () => {
  it("routes each node type to its page", () => {
    expect(nodeHref("author:OL1A")).toEqual(routes.author("OL1A"));
    expect(nodeHref("subject:science_fiction")).toEqual(routes.subject("science_fiction"));
    expect(nodeHref("genre:fantasy")).toEqual(routes.subject("fantasy"));
    expect(nodeHref("work:OL2W")).toEqual(routes.work("OL2W"));
    expect(nodeHref("editions:OL2W")).toEqual(routes.work("OL2W", { highlight: "editions" }));
    expect(nodeHref("award:hugo_award")).toEqual(routes.award("hugo_award"));
  });
  it("has no page for unresolved (qid) nodes", () => {
    expect(nodeHref("author:qid:Q1")).toBeNull();
  });
});

describe("nodePressHref", () => {
  it("opens the page for nodes with no graph of their own, even when not the center", () => {
    expect(nodePressHref("award:hugo_award", "work:OL1W")).toEqual(routes.award("hugo_award"));
    expect(nodePressHref("genre:fantasy", "work:OL1W")).toEqual(routes.subject("fantasy"));
    expect(nodePressHref("editions:OL1W", "work:OL1W")).toEqual(routes.work("OL1W", { highlight: "editions" }));
  });
  it("opens the center's page and recenters on any other node", () => {
    expect(nodePressHref("work:OL1W", "work:OL1W")).toEqual(routes.work("OL1W"));
    expect(nodePressHref("work:OL2W", "work:OL1W")).toBeNull();
  });
});
