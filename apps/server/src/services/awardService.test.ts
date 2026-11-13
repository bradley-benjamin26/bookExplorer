import { AwardSchema, awardDisplayName, awardSlug } from "@book-explorer/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as wikidata from "../sources/wikidata.js";
import { getAwardDetail } from "./awardService.js";

vi.mock("../sources/wikidata.js", () => ({ searchAwardQid: vi.fn(), fetchDescription: vi.fn(), fetchAwardWinners: vi.fn() }));

let n = 0;
const slug = () => `award_${n++}`; // distinct per test: results are cached by slug

beforeEach(() => vi.resetAllMocks());

describe("shared award helpers", () => {
  it("lands two spellings on one slug and title-cases the name", () => {
    expect(awardSlug("Hugo Award for Best Novella")).toBe("hugo_award");
    expect(awardSlug("hugo award (1966)")).toBe("hugo_award");
    expect(awardDisplayName("hugo award")).toBe("Hugo Award");
  });
  it("accepts a winner with a null kind", () => {
    const award = { slug: "a", name: "A", wikidataId: null, description: null, winners: [{ kind: null, openLibraryId: null, wikidataId: "Q1", label: "X" }] };
    expect(AwardSchema.parse(award)).toEqual(award);
  });
});

describe("getAwardDetail", () => {
  it("returns description and winners with kinds from the id suffix", async () => {
    vi.mocked(wikidata.searchAwardQid).mockResolvedValue("Q10");
    vi.mocked(wikidata.fetchDescription).mockResolvedValue("A prize");
    vi.mocked(wikidata.fetchAwardWinners).mockResolvedValue([
      { wikidataId: "Q1", openLibraryId: "OL26320A", label: "Tolkien" },
      { wikidataId: "Q2", openLibraryId: "OL45883W", label: "Dune" },
      { wikidataId: "Q3", openLibraryId: null, label: "Other" },
    ]);
    const a = await getAwardDetail(slug(), "hugo award");
    expect(a.name).toBe("Hugo Award");
    expect(a.wikidataId).toBe("Q10");
    expect(a.description).toBe("A prize");
    expect(a.winners.map((w) => w.kind)).toEqual(["author", "work", null]);
  });

  it("returns an empty valid award with no Wikidata match", async () => {
    vi.mocked(wikidata.searchAwardQid).mockResolvedValue(null);
    const a = await getAwardDetail(slug());
    expect(a).toMatchObject({ wikidataId: null, description: null, winners: [] });
    expect(AwardSchema.safeParse(a).success).toBe(true);
  });

  it("derives the name from the slug without a label", async () => {
    vi.mocked(wikidata.searchAwardQid).mockResolvedValue(null);
    expect((await getAwardDetail("nebula_award")).name).toBe("Nebula Award");
  });

  it("still returns the award when winners fail", async () => {
    vi.mocked(wikidata.searchAwardQid).mockResolvedValue("Q10");
    vi.mocked(wikidata.fetchDescription).mockResolvedValue("A prize");
    vi.mocked(wikidata.fetchAwardWinners).mockRejectedValue(new Error("down"));
    const a = await getAwardDetail(slug());
    expect(a.winners).toEqual([]);
    expect(a.description).toBe("A prize");
  });

  it("caps winners at 40", async () => {
    vi.mocked(wikidata.searchAwardQid).mockResolvedValue("Q10");
    vi.mocked(wikidata.fetchDescription).mockResolvedValue(null);
    vi.mocked(wikidata.fetchAwardWinners).mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({ wikidataId: `Q${i}`, openLibraryId: null, label: `W${i}` }))
    );
    expect((await getAwardDetail(slug())).winners).toHaveLength(40);
  });
});
