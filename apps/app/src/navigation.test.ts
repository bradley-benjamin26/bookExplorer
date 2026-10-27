import { describe, expect, it } from "vitest";
import { memberHref, nodeHref, routes } from "./navigation";

describe("memberHref", () => {
  it("routes each member type to its screen", () => {
    expect(memberHref({ type: "author", id: "OL1A" })).toEqual(routes.author("OL1A"));
    expect(memberHref({ type: "work", id: "OL2W" })).toEqual(routes.work("OL2W"));
    expect(memberHref({ type: "book", id: "978" })).toEqual(routes.book("978"));
  });
});

describe("nodeHref", () => {
  it("routes each node type to its page", () => {
    expect(nodeHref("author:OL1A")).toEqual(routes.author("OL1A"));
    expect(nodeHref("subject:science_fiction")).toEqual(routes.subject("science_fiction"));
    expect(nodeHref("genre:fantasy")).toEqual(routes.subject("fantasy"));
    expect(nodeHref("work:OL2W")).toEqual(routes.work("OL2W"));
    expect(nodeHref("editions:OL2W")).toEqual(routes.work("OL2W", { highlight: "editions" }));
  });
  it("has no page for unresolved (qid) nodes", () => {
    expect(nodeHref("author:qid:Q1")).toBeNull();
  });
});
