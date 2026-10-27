import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../sources/wikidata.js", () => ({ fetchSeries: vi.fn() }));
vi.mock("../sources/openLibrary.js", () => ({ findWork: vi.fn() }));

import { findWork } from "../sources/openLibrary.js";
import { fetchSeries } from "../sources/wikidata.js";
import { getSeriesDetail } from "./seriesService.js";

const member = (over: object = {}) => ({
  wikidataId: "Q2", title: "Tehanu", position: "4", openLibraryWorkId: "OL59847W", authorName: "Ursula K. Le Guin" as string | null, ...over,
});
const serve = (members: object[], n: string) =>
  vi.mocked(fetchSeries).mockResolvedValue({ wikidataId: n, name: "S", members } as never);

beforeEach(() => vi.clearAllMocks());

describe("getSeriesDetail", () => {
  it("links each member to the work Open Library finds by title and author, with its cover", async () => {
    serve([member()], "Q101");
    vi.mocked(findWork).mockResolvedValue({ workId: "OL15056578W", coverUrl: "c" });
    const s = await getSeriesDetail("Q101");
    expect(s?.members).toEqual([{ wikidataId: "Q2", title: "Tehanu", position: "4", openLibraryWorkId: "OL15056578W", coverUrl: "c" }]);
    expect(s?.members[0]).not.toHaveProperty("authorName");
    expect(findWork).toHaveBeenCalledWith("Tehanu", "Ursula K. Le Guin");
  });

  it("keeps Wikidata's id and no cover when the search finds nothing or fails", async () => {
    serve([member({ wikidataId: "Q3" }), member({ wikidataId: "Q4" })], "Q102");
    vi.mocked(findWork).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = await getSeriesDetail("Q102");
    expect(s?.members.map((m) => [m.openLibraryWorkId, m.coverUrl])).toEqual([["OL59847W", null], ["OL59847W", null]]);
  });

  it("does not search for a member with no author", async () => {
    serve([member({ authorName: null })], "Q103");
    const s = await getSeriesDetail("Q103");
    expect(findWork).not.toHaveBeenCalled();
    expect(s?.members[0]).toMatchObject({ openLibraryWorkId: "OL59847W", coverUrl: null });
  });
});
