import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchByIsbn, Z3950UnavailableError } from "../z3950/client.js";
import { getLibraryAvailability } from "./libraryAvailability.js";

vi.mock("../z3950/client.js", async (orig) => ({ ...(await orig<typeof import("../z3950/client.js")>()), searchByIsbn: vi.fn() }));

const search = vi.mocked(searchByIsbn);
const OUT = "Connection accepted\n852    $a Main $h 813 $r 1\n";

describe("getLibraryAvailability", () => {
  beforeEach(() => search.mockReset());

  it("returns null for an unknown id without searching", async () => {
    expect(await getLibraryAvailability("nope", "9780141439518")).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("caches a result", async () => {
    search.mockResolvedValue(OUT);
    const a = await getLibraryAvailability("mbln", "9780141439518");
    const b = await getLibraryAvailability("mbln", "9780141439518");
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
});
