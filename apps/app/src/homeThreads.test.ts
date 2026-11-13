import { describe, expect, it } from "vitest";
import { HOME_THREADS, pickThread } from "./homeThreads";

describe("HOME_THREADS", () => {
  it("has the six prepared threads with unique ids", () => {
    expect(HOME_THREADS.map((t) => t.id)).toEqual(["le-guin", "butler", "morrison", "pratchett", "shelley", "clarke"]);
  });

  it("uses well-formed Open Library ids and subject slugs, with text for every stop", () => {
    for (const t of HOME_THREADS) {
      expect(t.author.id).toMatch(/^OL\d+A$/);
      expect(t.work.id).toMatch(/^OL\d+W$/);
      expect(t.subject.slug).toMatch(/^[a-z0-9_]+$/);
      expect(t.author.name.length).toBeGreaterThan(0);
      expect(t.work.title.length).toBeGreaterThan(0);
      expect(t.subject.label.length).toBeGreaterThan(0);
    }
  });
});

describe("pickThread", () => {
  it("picks by the random value, including both ends of its range", () => {
    expect(pickThread(() => 0).id).toBe("le-guin");
    expect(pickThread(() => 0.999999).id).toBe("clarke");
    expect(pickThread(() => 0.5).id).toBe(pickThread(() => 0.5).id);
  });

  it("never returns the thread to avoid", () => {
    expect(pickThread(() => 0, "le-guin").id).not.toBe("le-guin");
    for (const x of [0, 0.2, 0.4, 0.6, 0.8, 0.999999]) expect(pickThread(() => x, "pratchett").id).not.toBe("pratchett");
  });
});
