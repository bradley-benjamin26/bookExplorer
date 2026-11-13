import { describe, expect, it, vi } from "vitest";
import { buildCommandFile, searchByIsbn, Z3950UnavailableError } from "./client.js";
import { getZ3950Library } from "./registry.js";

const lib = getZ3950Library("mbln")!;
const ok = "Connection accepted by v3 target.\nRecord type: USmarc\n";

describe("buildCommandFile", () => {
  it("has the six commands in order", () => {
    expect(buildCommandFile(lib, "9780141439518").trim().split("\n")).toEqual([
      "open catalog.mbln.org:210/pac",
      "find @attr 1=7 9780141439518",
      "format usmarc",
      "elements F",
      "show 1",
      "quit",
    ]);
  });
});

describe("searchByIsbn", () => {
  it("rejects when the target closes the connection", async () => {
    const run = vi.fn().mockResolvedValue("Target closed connection\n");
    await expect(searchByIsbn(lib, "9780141439518", undefined, run)).rejects.toBeInstanceOf(Z3950UnavailableError);
  });

  it("rejects when Init was not accepted", async () => {
    const run = vi.fn().mockResolvedValue("Connection rejected by v3 target.\n");
    await expect(searchByIsbn(lib, "9780141439518", undefined, run)).rejects.toBeInstanceOf(Z3950UnavailableError);
  });

  it.each(["9780141439518; rm -rf /", "978014143951\n8"])("rejects bad ISBN %j before running", async (isbn) => {
    const run = vi.fn();
    await expect(searchByIsbn(lib, isbn, undefined, run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it("normalizes a hyphenated ISBN to digits", async () => {
    const run = vi.fn().mockResolvedValue(ok);
    await expect(searchByIsbn(lib, "978-0-14-143951-8", undefined, run)).resolves.toBe(ok);
    expect(run.mock.calls[0][0]).toContain("find @attr 1=7 9780141439518\n");
  });
});
