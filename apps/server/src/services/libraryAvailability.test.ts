import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchByIsbn, Z3950UnavailableError } from "../z3950/client.js";
import { searchAlmaByIsbn } from "../sources/almaSru.js";
import { getLibraryAvailability } from "./libraryAvailability.js";

vi.mock("../z3950/client.js", async (orig) => ({ ...(await orig<typeof import("../z3950/client.js")>()), searchByIsbn: vi.fn() }));
vi.mock("../sources/almaSru.js", async (orig) => ({ ...(await orig<typeof import("../sources/almaSru.js")>()), searchAlmaByIsbn: vi.fn() }));

const search = vi.mocked(searchByIsbn);
const alma = vi.mocked(searchAlmaByIsbn);
const OUT = "Connection accepted\n852    $a Main $h 813 $r 1\n";

describe("getLibraryAvailability", () => {
  beforeEach(() => search.mockReset());

  it("returns null for an unknown id without searching", async () => {
    expect(await getLibraryAvailability("nope", "9780141439518")).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("caches a result", async () => {
    search.mockResolvedValue(OUT);
    const a = await getLibraryAvailability("kcmo", "9780306406157");
    const b = await getLibraryAvailability("kcmo", "9780306406157");
    expect(b).toEqual(a);
    expect(a?.level).toBe("availability");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does not cache an unavailable error", async () => {
    search.mockRejectedValueOnce(new Z3950UnavailableError("down"));
    await expect(getLibraryAvailability("kcmo", "9780141439518")).rejects.toBeInstanceOf(Z3950UnavailableError);
    search.mockResolvedValue(OUT);
    expect((await getLibraryAvailability("kcmo", "9780141439518"))?.found).toBe(true);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("links a Kansas City hit to its catalog search, and a miss to nothing", async () => {
    search.mockResolvedValueOnce(OUT).mockResolvedValueOnce("Connection accepted\nNumber of hits: 0\n");
    expect((await getLibraryAvailability("kcmo", "9781234567897"))?.recordUrl).toBe("https://kcmo.ent.sirsi.net/client/en_US/default/search/results?qu=9781234567897");
    expect((await getLibraryAvailability("kcmo", "9780000000002"))?.recordUrl).toBeNull();
  });

  it("sends UMD to its SRU catalog, not Z39.50", async () => {
    alma.mockResolvedValue({ found: true, copies: [], recordUrl: "https://example.org/r" });
    expect(await getLibraryAvailability("umd", "9780316769488")).toEqual({ found: true, level: "availability", copies: [], recordUrl: "https://example.org/r" });
    expect(search).not.toHaveBeenCalled();
  });
});
