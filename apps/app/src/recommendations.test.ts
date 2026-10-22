import { slugifySubject, type Graph, type Subject, type WorkRef } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { buildTasteProfile, mapWithConcurrency, rankRecommendations, reasonHeading, reasonKey, TOP_SUBJECTS, type AuthorSeed } from "./recommendations";
import type { SavedBookRecord } from "./storage/savedBooks";
import type { Snapshot } from "./storage/snapshot";

const book = (title: string, subjects: string[], extra: Partial<SavedBookRecord> = {}): SavedBookRecord => ({
  schemaVersion: 1,
  updatedAt: 1,
  isbn: title,
  wikidataId: null,
  openLibraryEditionId: null,
  openLibraryWorkId: null,
  title,
  authorNames: [],
  format: null,
  subjects,
  genres: [],
  notes: "",
  savedAt: 1,
  ...extra,
});
const snapshot = (books: SavedBookRecord[], items: Snapshot["items"] = [], works: Snapshot["works"] = []): Snapshot => ({ schemaVersion: 1, items, books, works, libraries: [] });
const savedWork = (title: string, subjects: string[]): Snapshot["works"][number] => ({
  schemaVersion: 1, updatedAt: 1, openLibraryWorkId: `OL${title}W`, title, authorNames: [], subjects, genres: [], notes: "", savedAt: 1,
});
const work = (id: string, authorId = "OLxA"): WorkRef => ({ openLibraryWorkId: id, title: `Title ${id}`, authors: [{ openLibraryId: authorId, name: authorId }], coverUrl: null });
const subject = (slug: string, books: WorkRef[]): Subject => ({ slug, name: slug, workCount: books.length, wikidataId: null, description: null, relatedConcepts: [], books });
// Treats every saved term as public (as if every book's API detail were cached).
const profileOf = (s: Snapshot, seeds: AuthorSeed[]) =>
  buildTasteProfile(s, seeds, new Set([...s.books, ...s.works].flatMap((b) => [...b.subjects, ...b.genres]).map(slugifySubject)));
const subjects = (...list: Subject[]) => new Map(list.map((s) => [s.slug, s]));

// Three saved books: "Fiction" on all of them (common, low idf), "Napoleonic Wars" on one (rare, high idf).
const library = snapshot([
  book("Sharpe", ["Fiction", "Napoleonic Wars"], { openLibraryWorkId: "OLsharpeW" }),
  book("Emma", ["Fiction", "Historical fiction"]),
  book("Dune", ["Fiction"]),
]);
const results = subjects(
  subject("fiction", [work("W1"), work("W2"), work("OLsharpeW"), work("W4")]),
  subject("napoleonic_wars", [work("W2"), work("W3")]),
  subject("historical_fiction", [work("W4")])
);

describe("buildTasteProfile", () => {
  it("orders subjects by how many saved books carry them and weighs rarer ones more", () => {
    const profile = profileOf(library, []);
    expect(profile.subjects.map((s) => s.slug)).toEqual(["fiction", "historical_fiction", "napoleonic_wars"]);
    expect(profile.subjects[2].weight).toBeGreaterThan(profile.subjects[0].weight);
  });

  it("ignores removed books and caps the subject count", () => {
    const many = Array.from({ length: TOP_SUBJECTS + 3 }, (_, i) => `S${i}`);
    const profile = profileOf(snapshot([book("A", many), book("Gone", ["Only here"], { deletedAt: 2 })]), []);
    expect(profile.subjects).toHaveLength(TOP_SUBJECTS);
    expect(profile.subjects.some((s) => s.slug === "only_here")).toBe(false);
  });

  it("never uses a term no API response gave, so the user's own tags stay on the device", () => {
    const tagged = snapshot([book("Sharpe", ["Napoleonic Wars", "Read on holiday"]), book("Emma", ["Read on holiday"])]);
    const profile = buildTasteProfile(tagged, [], new Set(["napoleonic_wars"]));
    expect(profile.subjects.map((s) => s.slug)).toEqual(["napoleonic_wars"]);
  });

  it("keeps the authors behind the most saved items", () => {
    const seeds = ["OL1A", "OL2A", "OL2A", "OL3A", "OL3A", "OL4A", "OL4A"].map((id, i) => ({ id, name: id, seedTitle: `Book ${9 - i}` }));
    const profile = profileOf(snapshot([]), seeds);
    expect(profile.authors).toEqual([
      { id: "OL2A", name: "OL2A", seedTitle: "Book 7" },
      { id: "OL3A", name: "OL3A", seedTitle: "Book 5" },
      { id: "OL4A", name: "OL4A", seedTitle: "Book 3" },
    ]);
  });
});

describe("saved works as seeds", () => {
  const withWork = snapshot([], [], [savedWork("Hyperion", ["Science fiction", "Read in 2020"])]);
  it("counts a saved work's API subjects but never its user-typed ones", () => {
    const profile = buildTasteProfile(withWork, [], new Set(["science_fiction"]));
    expect(profile.subjects.map((s) => s.slug)).toEqual(["science_fiction"]);
    expect(profile.subjects[0].seedTitles).toEqual(["Hyperion"]);
  });
});

describe("recommendation reasons", () => {
  const two = snapshot([book("Zed", ["Napoleonic Wars"]), book("Abe", ["Napoleonic Wars"])]);
  it("groups by the shared subject, not the alphabetically first title", () => {
    const [rec] = rankRecommendations(profileOf(two, []), subjects(subject("napoleonic_wars", [work("W1")])), new Map());
    expect(rec.reason).toEqual({ kind: "subject", label: "Napoleonic Wars", seedTitles: ["Abe", "Zed"] });
    expect(reasonKey(rec.reason)).toBe("subject:Napoleonic Wars");
    expect(reasonHeading(rec.reason)).toBe("Because you like Napoleonic Wars (2 saved)");
  });
  it("is deterministic and words author and influence headings", () => {
    const a = rankRecommendations(profileOf(two, []), subjects(subject("napoleonic_wars", [work("W2"), work("W1")])), new Map());
    expect(rankRecommendations(profileOf(two, []), subjects(subject("napoleonic_wars", [work("W2"), work("W1")])), new Map())).toEqual(a);
    expect(reasonHeading({ kind: "subject", label: "Fantasy", seedTitles: ["A"] })).toBe("Because you like Fantasy");
    expect(reasonHeading({ kind: "author", label: "Tolkien", seedTitles: [] })).toBe("More by Tolkien");
    expect(reasonHeading({ kind: "influence", label: "Tolkien", seedTitles: [] })).toBe("Influenced by Tolkien");
  });
});

describe("rankRecommendations", () => {
  it("returns nothing for an empty library", () => {
    expect(rankRecommendations(profileOf(snapshot([]), []), results, new Map())).toEqual([]);
  });

  it("ranks by idf-weighted shared subjects, deterministically, and explains each row", () => {
    const ranked = rankRecommendations(profileOf(library, []), results, new Map());
    expect(ranked.map((r) => r.work.openLibraryWorkId)).toEqual(["W2", "W4", "W3", "W1"]);
    expect(ranked[0]).toMatchObject({ reason: { kind: "subject", label: "Napoleonic Wars", seedTitles: ["Sharpe"] }, shares: ["Fiction", "Napoleonic Wars"] });
    expect(ranked[1]).toMatchObject({ reason: { kind: "subject", label: "Historical fiction", seedTitles: ["Emma"] }, shares: ["Fiction", "Historical fiction"] });
    // W2 and W4 tie on score; the title tie-break keeps the order the same on every run.
    expect(rankRecommendations(profileOf(library, []), results, new Map())).toEqual(ranked);
  });

  it("excludes saved works and saved books' works", () => {
    const withSavedWork = snapshot(library.books, [{ schemaVersion: 1, updatedAt: 1, type: "work", id: "W2", title: "Saved" }]);
    const ids = rankRecommendations(profileOf(withSavedWork, []), results, new Map()).map((r) => r.work.openLibraryWorkId);
    expect(ids).not.toContain("W2");
    expect(ids).not.toContain("OLsharpeW");
  });

  it("excludes a saved book with no work id by its title", () => {
    const noWorkId = snapshot([book("Sharpe's Eagle", ["Napoleonic Wars"])]);
    const listing = subjects(subject("napoleonic_wars", [{ ...work("W5"), title: "  sharpe's  EAGLE" }, work("W6")]));
    expect(rankRecommendations(profileOf(noWorkId, []), listing, new Map()).map((r) => r.work.openLibraryWorkId)).toEqual(["W6"]);
  });

  it("adds author and influence links from author graphs", () => {
    const seed: AuthorSeed = { id: "OLtA", name: "Tolkien", seedTitle: "The Hobbit" };
    const graph: Graph = {
      centerId: "author:OLtA",
      nodes: [
        { id: "author:OLtA", type: "author", label: "Tolkien", navigable: true },
        { id: "work:OLsilW", type: "work", label: "Silmarillion", navigable: true },
        { id: "author:OLmA", type: "author", label: "Morris", navigable: true },
        { id: "work:qid:Q1", type: "work", label: "Unlinked", navigable: false },
      ],
      edges: [
        { source: "author:OLtA", target: "work:OLsilW", relation: "wrote" },
        { source: "author:OLtA", target: "author:OLmA", relation: "influencedBy" },
        { source: "author:OLtA", target: "work:qid:Q1", relation: "notableWork" },
      ],
    };
    const profile = profileOf(snapshot([book("The Hobbit", ["Fantasy"])]), [seed]);
    const ranked = rankRecommendations(profile, subjects(subject("fantasy", [work("W9", "OLmA"), work("W8")])), new Map([["OLtA", graph]]));
    expect(ranked.map((r) => r.work.openLibraryWorkId)).toEqual(["W9", "OLsilW", "W8"]);
    expect(ranked[0].shares).toEqual(["Fantasy", "influence link to Tolkien"]);
    expect(ranked[1]).toMatchObject({ reason: { kind: "author", label: "Tolkien", seedTitles: ["The Hobbit"] }, shares: ["author Tolkien"] });
  });

  it("lets a rating reorder close candidates but not outweigh another shared subject", () => {
    const profile = profileOf(library, []);
    // The largest boost and penalty still can't close W1's gap of one rare subject to W3.
    const ranked = rankRecommendations(profile, results, new Map(), new Map([["W1", 5], ["W3", 1]]));
    expect(ranked.map((r) => r.work.openLibraryWorkId)).toEqual(["W2", "W4", "W3", "W1"]);
    const tie = subjects(subject("fiction", [work("A"), work("B")]));
    expect(rankRecommendations(profile, tie, new Map()).map((r) => r.work.openLibraryWorkId)).toEqual(["A", "B"]);
    expect(rankRecommendations(profile, tie, new Map(), new Map([["B", 4.5]])).map((r) => r.work.openLibraryWorkId)).toEqual(["B", "A"]);
    const strong = subjects(subject("fiction", [work("A"), work("B")]), subject("napoleonic_wars", [work("A")]));
    expect(rankRecommendations(profile, strong, new Map(), new Map([["A", 1], ["B", 5]]))[0].work.openLibraryWorkId).toBe("A");
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 6 - n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});
