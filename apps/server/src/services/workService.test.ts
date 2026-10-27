import { beforeEach, describe, expect, it, vi } from "vitest";
import * as openLibrary from "../sources/openLibrary.js";
import { UpstreamUnavailableError } from "../httpClient.js";
import { startCommonEnrichment } from "./bookEnrichment.js";
import { getWorkDetail, getWorkLinks } from "./workService.js";

vi.mock("../sources/openLibrary.js", () => ({ getWork: vi.fn() }));
vi.mock("../sources/wikidata.js", () => ({ fetchGenres: vi.fn(), fetchWorkSeries: vi.fn() }));
vi.mock("./bookEnrichment.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bookEnrichment.js")>()),
  startCommonEnrichment: vi.fn(),
  findWorkQid: vi.fn(),
  fetchMoreByAuthor: vi.fn(),
}));

describe("getWorkLinks", () => {
  beforeEach(async () => {
    vi.mocked(openLibrary.getWork).mockReset().mockResolvedValue({
      title: "Dune",
      authors: [{ openLibraryId: "OL2A", name: "Frank Herbert" }],
      coverUrl: null,
      description: null,
      subjects: ["Desert", "genre:Science Fiction", "award:hugo_award=1966"],
      isbn: null,
      isbnCandidates: [],
      editions: [],
    });
    vi.mocked(startCommonEnrichment).mockReset().mockReturnValue({
      locMetadataPromise: Promise.resolve({ subjects: ["Fathers and sons"], genres: [] }),
      hardcoverPromise: Promise.resolve(null),
      olRatingsPromise: Promise.resolve(null),
    } as unknown as ReturnType<typeof startCommonEnrichment>);
    const enrichment = await import("./bookEnrichment.js");
    vi.mocked(enrichment.findWorkQid).mockResolvedValue(null);
    vi.mocked(enrichment.fetchMoreByAuthor).mockResolvedValue([]);
  });

  it("fetches only the Open Library work record, without editions", async () => {
    const links = await getWorkLinks("OL1W");
    expect(openLibrary.getWork).toHaveBeenCalledWith("OL1W", { editions: false });
    expect(startCommonEnrichment).not.toHaveBeenCalled();
    expect(links?.subjects.map((s) => s.label)).toEqual(["Desert"]);
    expect(links?.awards).toEqual(["hugo award (1966)"]);
    expect(links?.editions).toEqual([]);
  });

  it("reuses a fully loaded work when one is already cached", async () => {
    await getWorkDetail("OL2W");
    const links = await getWorkLinks("OL2W");
    expect(openLibrary.getWork).toHaveBeenCalledTimes(1);
    expect(links?.subjects.map((s) => s.label)).toContain("Fathers and sons");
  });

  it("never stands in for the full work on the work page", async () => {
    await getWorkLinks("OL3W");
    await getWorkDetail("OL3W");
    expect(startCommonEnrichment).toHaveBeenCalledTimes(1);
  });

  it("lets an Open Library cooldown through", async () => {
    vi.mocked(openLibrary.getWork).mockRejectedValueOnce(new UpstreamUnavailableError("openlibrary.org", 60_000));
    await expect(getWorkLinks("OL4W")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
