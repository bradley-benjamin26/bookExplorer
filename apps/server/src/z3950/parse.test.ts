import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRecord } from "./parse.js";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), "utf8");
const count = (copies: { status: string }[], s: string) => copies.filter((c) => c.status === s).length;

describe("parseRecord", () => {
  it("parses Polaris 852 holdings", () => {
    const { found, copies } = parseRecord(fx("mbln"), "polaris852");
    expect(found).toBe(true);
    expect(copies).toHaveLength(15);
    expect(count(copies, "available")).toBe(5);
    expect(count(copies, "unavailable")).toBe(2);
    expect(count(copies, "checkedOut")).toBe(8);
    expect(copies.filter((c) => c.status === "checkedOut").every((c) => c.dueDate)).toBe(true);
    expect(copies[0]).toMatchObject({ branch: "BPL- West End Branch Library", callNumber: "AUSTEN J", dueDate: null });
  });

  it("parses Sirsi 926 ON-SHELF as available", () => {
    const { copies } = parseRecord(fx("kcmo"), "sirsi926");
    expect(copies).toHaveLength(4);
    expect(copies.every((c) => c.status === "available")).toBe(true);
    expect(copies[0]).toMatchObject({ branch: "STTERESA", callNumber: "FIC AUS" });
  });

  it("maps Sirsi CHECKEDOUT with a due date; HOLDS is unknown", () => {
    const { copies } = parseRecord(fx("kcmo-checkedout"), "sirsi926");
    expect(copies.find((c) => c.branch === "KC-WALDO")).toMatchObject({ status: "checkedOut", dueDate: "11/16/2026" });
    expect(copies.find((c) => c.branch === "KC-TRAILS")?.status).toBe("unknown");
  });

  it("returns no copies for catalog-level servers", () => {
    expect(parseRecord(fx("more"), "none")).toEqual({ found: true, copies: [] });
    expect(parseRecord(fx("nwrls"), "none")).toEqual({ found: true, copies: [] });
  });

  it("reports a miss", () => {
    expect(parseRecord(fx("miss"), "none")).toEqual({ found: false, copies: [] });
  });

  it("never treats an unrecognised status as available", () => {
    const out = "Record type: USmarc\n852    $a X $h Y $r Weird\n";
    expect(parseRecord(out, "polaris852").copies[0].status).toBe("unknown");
  });
});
