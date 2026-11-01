import { beforeEach, describe, expect, it, vi } from "vitest";
import * as locLinkedData from "../sources/locLinkedData.js";
import { canonicalizeSubjects } from "./subjectCanon.js";

vi.mock("../sources/locLinkedData.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sources/locLinkedData.js")>()),
  findSubjectHeadingWithStatus: vi.fn(),
}));

describe("canonicalizeSubjects", () => {
  beforeEach(() => {
    vi.mocked(locLinkedData.findSubjectHeadingWithStatus).mockReset();
  });

  it("resolves distinct subject keys and maps results back to each original label", async () => {
    const heading = {
      uri: "http://id.loc.gov/authorities/subjects/sh85062085",
      heading: "Horror tales, American",
      variants: ["American horror tales"],
    };
    vi.mocked(locLinkedData.findSubjectHeadingWithStatus).mockImplementation(async (label) => ({
      heading: label.toLowerCase() === "zombies" ? null : heading,
      failed: false,
    }));

    const result = await canonicalizeSubjects(["Horror tales, American", "American horror tales", "Zombies", "zombies"]);

    expect(locLinkedData.findSubjectHeadingWithStatus).toHaveBeenCalledTimes(3);
    expect(result.get("Horror tales, American")).toMatchObject({
      uri: heading.uri,
      heading: heading.heading,
      display: "American horror tales",
      slug: "horror_tales_american",
    });
    expect(result.get("American horror tales")).toEqual(result.get("Horror tales, American"));
    expect(result.get("Zombies")).toBeNull();
    expect(result.get("zombies")).toBeNull();
  });

  it("retries a failed lookup after the short degraded TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.mocked(locLinkedData.findSubjectHeadingWithStatus)
        .mockResolvedValueOnce({ heading: null, failed: true })
        .mockResolvedValueOnce({
          heading: {
            uri: "http://id.loc.gov/authorities/subjects/sh987654",
            heading: "Recovered heading",
            variants: [],
          },
          failed: false,
        });

      const callerEntry = { ttlMs: 60 * 60 * 1000 };
      expect((await canonicalizeSubjects(["Canon retry target"], callerEntry)).get("Canon retry target")).toBeNull();
      expect(callerEntry.ttlMs).toBe(60_000);
      vi.advanceTimersByTime(60_001);
      expect((await canonicalizeSubjects(["Canon retry target"])).get("Canon retry target")).toMatchObject({
        uri: "http://id.loc.gov/authorities/subjects/sh987654",
      });
      expect(locLinkedData.findSubjectHeadingWithStatus).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("limits simultaneous authority requests to eight", async () => {
    let active = 0;
    let maximumActive = 0;
    vi.mocked(locLinkedData.findSubjectHeadingWithStatus).mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return { heading: null, failed: false };
    });

    await canonicalizeSubjects(Array.from({ length: 10 }, (_, index) => `Bounded lookup ${index}`));

    expect(maximumActive).toBe(8);
    expect(locLinkedData.findSubjectHeadingWithStatus).toHaveBeenCalledTimes(10);
  });
});
