import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { buildCommandFile, runYazClient, searchByIsbn, Z3950UnavailableError } from "./client.js";
import { getZ3950Library } from "./registry.js";

const lib = getZ3950Library("kcmo")!;
const ok = "Connection accepted by v3 target.\nRecord type: USmarc\n";

describe("buildCommandFile", () => {
  it("has the six commands in order", () => {
    expect(buildCommandFile(lib, "9780141439518").trim().split("\n")).toEqual([
      "open kcmo.sirsi.net:2500/UNICORN",
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

describe("concurrency", () => {
  it("never runs more than 4 at once and frees slots after a rejecting run", async () => {
    let inFlight = 0;
    let max = 0;
    const run = vi.fn(async (cmds: string) => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (cmds.includes("9780141439518")) throw new Z3950UnavailableError("boom");
      return ok;
    });
    const isbns = Array.from({ length: 10 }, (_, i) => (i % 2 ? "9780141439518" : "9780306406157"));
    const results = await Promise.allSettled(isbns.map((i) => searchByIsbn(lib, i, undefined, run)));
    expect(run).toHaveBeenCalledTimes(10);
    expect(max).toBe(4);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(5);
    // all slots were released: four more calls still run together
    max = 0;
    await Promise.all(Array.from({ length: 4 }, () => searchByIsbn(lib, "9780306406157", undefined, run)));
    expect(max).toBe(4);
  });

  it("rejects an already-aborted call without running", async () => {
    const run = vi.fn();
    await expect(searchByIsbn(lib, "9780306406157", AbortSignal.abort(), run)).rejects.toBeInstanceOf(Z3950UnavailableError);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("runYazClient", () => {
  it("rejects with Z3950UnavailableError and leaves no temp dir when yaz-client is missing", async () => {
    const count = () => readdirSync(tmpdir()).filter((n) => n.startsWith("yaz-")).length;
    const before = count();
    const oldPath = process.env.PATH;
    process.env.PATH = "/nonexistent-dir";
    try {
      await expect(runYazClient("quit\n")).rejects.toBeInstanceOf(Z3950UnavailableError);
    } finally {
      process.env.PATH = oldPath;
    }
    expect(count()).toBe(before);
  });
});
