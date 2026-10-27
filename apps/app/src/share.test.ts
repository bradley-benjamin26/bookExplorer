import { describe, expect, it, vi } from "vitest";
import { WEB_ORIGIN, shareFeedback, webUrl } from "./share";
import { routes } from "./navigation";

const ORIGIN = "https://shelfthread.com";

describe("webUrl", () => {
  it.each([
    [routes.book("9780306406157"), `${ORIGIN}/book/9780306406157`],
    [routes.subject("fiction,_(general)/x"), `${ORIGIN}/subject/fiction%2C_(general)%2Fx`],
    [routes.work("OL1W", { highlight: "editions" }), `${ORIGIN}/work/OL1W?highlight=editions`],
    [routes.graph("work", "OL64034W"), `${ORIGIN}/graph/work/OL64034W`],
    [routes.graph("author", "OL1A", { hideTypes: "work,genre" }), `${ORIGIN}/graph/author/OL1A?hideTypes=work%2Cgenre`],
    [routes.saved(), `${ORIGIN}/saved`],
    [routes.search("dune & co"), `${ORIGIN}/search?q=dune+%26+co`],
  ])("%j", (href, url) => expect(webUrl(href, ORIGIN)).toBe(url));

  it("uses the given origin", () => {
    expect(webUrl(routes.saved(), "http://localhost:8081")).toBe("http://localhost:8081/saved");
  });

  it("defaults to the current web origin, else shelfthread.com", () => {
    expect(webUrl(routes.saved())).toBe(`${WEB_ORIGIN}/saved`);
    vi.stubGlobal("location", {});
    expect(webUrl(routes.saved())).toBe(`${WEB_ORIGIN}/saved`);
    vi.stubGlobal("location", { origin: "http://localhost:8081" });
    expect(webUrl(routes.saved())).toBe("http://localhost:8081/saved");
    vi.unstubAllGlobals();
  });
});

describe("shareFeedback", () => {
  it("confirms a copy, stays quiet for a share sheet or a dismissal, and reports other failures", async () => {
    expect(await shareFeedback(async () => true)).toBe("Link copied");
    expect(await shareFeedback(async () => false)).toBe("");
    expect(await shareFeedback(() => Promise.reject(new DOMException("dismissed", "AbortError")))).toBe("");
    expect(await shareFeedback(() => Promise.reject(new Error("NotAllowedError")))).toBe("Couldn't share");
  });
});
