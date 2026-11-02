import { describe, expect, it } from "vitest";
import { editLinkHost } from "./termsEditHost";

describe("editLinkHost", () => {
  it("hosts on genres when there are genres", () => expect(editLinkHost(["a"], ["b"], false)).toBe("genres"));
  it("falls back to subjects", () => expect(editLinkHost([], ["b"], false)).toBe("subjects"));
  it("is standalone with neither", () => expect(editLinkHost([], [], false)).toBe("standalone"));
  it("stays on genres while unlocked so Save doesn't jump", () => expect(editLinkHost([], [], true)).toBe("genres"));
});
