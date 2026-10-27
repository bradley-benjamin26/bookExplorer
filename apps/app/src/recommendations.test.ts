import { slugifySubject, type Graph, type Subject, type WorkRef } from "@book-explorer/shared";
import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Book, Work } from "@book-explorer/shared";
import { buildTasteProfile, detailLanded, explain, mapWithConcurrency, rankRecommendations, reasonHeading, reasonKey, seedsFromCache, TOP_SUBJECTS, type AuthorSeed } from "./recommendations";
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
const snapshot = (books: SavedBookRecord[], items: Snapshot["items"] = [], works: Snapshot["works"] = []): Snapshot => ({ schemaVersion: 1, items, books, works, libraries: [], lists: [] });
const savedWork = (title: string, subjects: string[]): Snapshot["works"][number] => ({
  schemaVersion: 1, updatedAt: 1, openLibraryWorkId: `OL${title}W`, title, authorNames: [], subjects, genres: [], notes: "", savedAt: 1,
});
const work = (id: string, authorId = "OLxA"): WorkRef => ({ openLibraryWorkId: id, title: `Title ${id}`, authors: [{ openLibraryId: authorId, name: authorId }], coverUrl: null });
const subject = (slug: string, books: WorkRef[]): Subject => ({ slug, name: slug, workCount: books.length, wikidataId: null, description: null, relatedConcepts: [], books });
// Treats every saved term as public (as if every book's API detail were cached).
const profileOf = (s: Snapshot, seeds: AuthorSeed[]) =>
  buildTasteProfile(s, seeds, new Set([...s.books, ...s.works].flatMap((b) => [...b.subjects, ...b.genres]).map(slugifySubject)));
const subjects = (...list: Subject[]) => new Map(list.map((s) => [s.slug, s]));

// Six saved books: "Fiction" on five of them (common, low idf), "Napoleonic Wars" and "Historical fiction" on two each (rarer, high idf).
// A subject only counts when at least MIN_SHARED_SUBJECT saved items carry it.
const library = snapshot([
  book("Sharpe", ["Fiction", "Napoleonic Wars"], { openLibraryWorkId: "OLsharpeW" }),
  book("Emma", ["Fiction", "Historical fiction"]),
  book("Dune", ["Fiction"]),
  book("Persuasion", ["Fiction"]),
  book("Ulysses", ["Fiction"]),
  book("Waterloo", ["Napoleonic Wars", "Historical fiction"]),
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
    const profile = profileOf(snapshot([book("A", many), book("B", many), book("Gone", ["Only here"], { deletedAt: 2 })]), []);
    expect(profile.subjects).toHaveLength(TOP_SUBJECTS);
    expect(profile.subjects.some((s) => s.slug === "only_here")).toBe(false);
  });

  it("drops a subject only one saved item carries, so a one-off tag can't head a group", () => {
    const profile = profileOf(snapshot([book("The Mist", ["Horror", "baggers"]), book("It", ["Horror"])]), []);
    expect(profile.subjects.map((s) => s.slug)).toEqual(["horror"]);
  });

  it("never uses a term no API response gave, so the user's own tags stay on the device", () => {
    const tagged = snapshot([book("Sharpe", ["Napoleonic Wars", "Read on holiday"]), book("Emma", ["Napoleonic Wars", "Read on holiday"])]);
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
  const withWork = snapshot([], [], [savedWork("Hyperion", ["Science fiction", "Read in 2020"]), savedWork("Dune", ["Science fiction"])]);
  const cached = (subjects: string[]) =>
    ({ openLibraryWorkId: "OLHyperionW", authors: [{ openLibraryId: "OLsA", name: "Simmons" }], subjects: subjects.map((label) => ({ label })), genres: [] }) as unknown as Work;
  const none = () => undefined;
  // Cached under the query id; the payload's own id may differ.
  const byQueryId = <T,>(entries: Record<string, T>) => (id: string) => entries[id];
  it("counts a saved work's cached API subjects but never its user-typed ones", () => {
    const { seeds, publicSlugs } = seedsFromCache(withWork, none, byQueryId({ OLHyperionW: cached(["Science fiction"]) }));
    expect([...publicSlugs]).toEqual(["science_fiction"]);
    expect(seeds).toEqual([{ id: "OLsA", name: "Simmons", seedTitle: "Hyperion" }]);
    const profile = buildTasteProfile(withWork, seeds, publicSlugs);
    expect(profile.subjects.map((s) => s.slug)).toEqual(["science_fiction"]);
  });
  it("contributes nothing without a cached detail", () => {
    const { seeds, publicSlugs } = seedsFromCache(withWork, none, none);
    expect(seeds).toEqual([]);
    expect(publicSlugs.size).toBe(0);
  });
  it("finds a detail under the saved id even when the server redirected the work", () => {
    const redirected = { ...cached(["Science fiction"]), openLibraryWorkId: "OLnewW" } as Work;
    const { seeds } = seedsFromCache(withWork, none, byQueryId({ OLHyperionW: redirected }));
    expect(seeds).toEqual([{ id: "OLsA", name: "Simmons", seedTitle: "Hyperion" }]);
  });
  it("finds a book's detail under the saved ISBN or its other form, whatever ISBN the payload carries", () => {
    const detail = (isbn: string) => ({ isbn, authors: [{ openLibraryId: "OLaA", name: "Austen" }], subjects: [{ label: "Courtship" }], genres: [] }) as unknown as Book;
    const saved = snapshot([book("Emma", [], { isbn: "0141439580" })]);
    // Cached under the route's ISBN-13 form, payload carrying yet another ISBN.
    const { seeds, publicSlugs } = seedsFromCache(saved, byQueryId({ "9780141439587": detail("9999999999") }), none);
    expect(seeds).toEqual([{ id: "OLaA", name: "Austen", seedTitle: "Emma" }]);
    expect([...publicSlugs]).toEqual(["courtship"]);
    expect(seedsFromCache(saved, byQueryId({ "0141439580": detail("x") }), none).seeds).toHaveLength(1);
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
  it("is deterministic whatever the input order", () => {
    const books = [book("Zed", ["Alpha", "Beta"]), book("Abe", ["Alpha", "Beta"]), book("Mid", ["Beta"])];
    const listing = (order: string[]) => subjects(...order.map((slug) => subject(slug, [work("W1"), work("W2")])));
    const run = (b: SavedBookRecord[], order: string[]) => rankRecommendations(profileOf(snapshot(b), []), listing(order), new Map()).map((r) => [r.work.openLibraryWorkId, reasonKey(r.reason), r.reason.seedTitles]);
    const base = run(books, ["alpha", "beta"]);
    expect(run([...books].reverse(), ["beta", "alpha"])).toEqual(base);
    expect(run([books[1], books[2], books[0]], ["beta", "alpha"])).toEqual(base);
  });
  it("breaks reason ties on weight, then saved count, then label", () => {
    // Weight is idf: the rarer subject wins even with fewer saved books.
    const rare = rankRecommendations(profileOf(snapshot([book("A", ["Common", "Rare"]), book("B", ["Common", "Rare"]), book("C", ["Common"]), book("D", ["Common"])]), []), subjects(subject("common", [work("W1")]), subject("rare", [work("W1")])), new Map());
    expect(rare[0].reason.label).toBe("Rare");
    // Equal weights: more saved items wins, then the label.
    const reasons = (labels: [string, string[]][]) =>
      labels.map(([label, seedTitles]) => ({ kind: "subject" as const, label, seedTitles, share: label, weight: 1 }));
    const pick = (r: ReturnType<typeof reasons>) => explain(r).reason.label;
    expect(pick(reasons([["A", ["x"]], ["B", ["x", "y"]]]))).toBe("B");
    expect(pick(reasons([["B", ["x"]], ["A", ["y"]]]))).toBe("A");
  });
  it("words the headings", () => {
    expect(reasonHeading({ kind: "subject", label: "Fantasy", seedTitles: ["A"] })).toBe("Because you like Fantasy");
    expect(reasonHeading({ kind: "author", label: "Tolkien", seedTitles: [] })).toBe("More by Tolkien");
    expect(reasonHeading({ kind: "influence", label: "Tolkien", seedTitles: [] })).toBe("Connected to Tolkien");
  });
});

describe("rankRecommendations", () => {
  it("returns nothing for an empty library", () => {
    expect(rankRecommendations(profileOf(snapshot([]), []), results, new Map())).toEqual([]);
  });

  it("ranks by idf-weighted shared subjects, deterministically, and explains each row", () => {
    const ranked = rankRecommendations(profileOf(library, []), results, new Map());
    expect(ranked.map((r) => r.work.openLibraryWorkId)).toEqual(["W2", "W4", "W3", "W1"]);
    expect(ranked[0]).toMatchObject({ reason: { kind: "subject", label: "Napoleonic Wars", seedTitles: ["Sharpe", "Waterloo"] }, shares: ["Fiction", "Napoleonic Wars"] });
    expect(ranked[1]).toMatchObject({ reason: { kind: "subject", label: "Historical fiction", seedTitles: ["Emma", "Waterloo"] }, shares: ["Fiction", "Historical fiction"] });
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
    const noWorkId = snapshot([book("Sharpe's Eagle", ["Napoleonic Wars"]), book("Sharpe's Rifles", ["Napoleonic Wars"])]);
    const listing = subjects(subject("napoleonic_wars", [{ ...work("W5"), title: "  sharpe's  EAGLE" }, work("W6")]));
    expect(rankRecommendations(profileOf(noWorkId, []), listing, new Map()).map((r) => r.work.openLibraryWorkId)).toEqual(["W6"]);
  });

  it("excludes a recommended title that differs from a saved one only by a leading article", () => {
    const saved = snapshot([book("Cricket in Times Square", ["Fiction"]), book("Other", ["Fiction"])]);
    const listing = subjects(subject("fiction", [{ ...work("W7"), title: "The Cricket in Times Square" }, work("W8")]));
    expect(rankRecommendations(profileOf(saved, []), listing, new Map()).map((r) => r.work.openLibraryWorkId)).toEqual(["W8"]);
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
    const profile = profileOf(snapshot([book("The Hobbit", ["Fantasy"]), book("The Fellowship", ["Fantasy"])]), [seed]);
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

describe("detailLanded", () => {
  const watch = () => {
    const client = new QueryClient();
    const landed: unknown[] = [];
    client.getQueryCache().subscribe((e) => {
      if (detailLanded(e)) landed.push(e.query.queryKey);
    });
    return { client, landed };
  };

  it("ignores a detail query added without data, as useQuery does mid-render, until its data arrives", () => {
    const { client, landed } = watch();
    client.getQueryCache().build(client, { queryKey: ["work", "OL1W"] });
    expect(landed).toEqual([]);
    client.setQueryData(["work", "OL1W"], { title: "Dune" });
    expect(landed).toEqual([["work", "OL1W"]]);
  });

  it("counts a detail restored from the persisted cache, and nothing but book and work details", () => {
    const source = new QueryClient();
    source.setQueryData(["book", "9780441013593"], { title: "Dune" });
    source.setQueryData(["subject", "deserts"], { name: "Deserts" });
    const { client, landed } = watch();
    hydrate(client, dehydrate(source));
    expect(landed).toEqual([["book", "9780441013593"]]);
  });
});
