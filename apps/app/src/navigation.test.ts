import { describe, expect, it } from "vitest";
import { memberHref, routes } from "./navigation";

describe("memberHref", () => {
  it("routes each member type to its screen", () => {
    expect(memberHref({ type: "author", id: "OL1A" })).toEqual(routes.author("OL1A"));
    expect(memberHref({ type: "work", id: "OL2W" })).toEqual(routes.work("OL2W"));
    expect(memberHref({ type: "book", id: "978" })).toEqual(routes.book("978"));
  });
});
