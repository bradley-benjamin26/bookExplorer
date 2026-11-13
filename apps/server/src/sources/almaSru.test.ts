import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAlmaLibrary, parseAlmaResponse } from "./almaSru.js";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), "utf8");
const umd = getAlmaLibrary("umd")!;
const parse = (xml: string, isbn: string) => parseAlmaResponse(xml, isbn, umd.recordUrl);

const wrap = (records: string[]) =>
  `<searchRetrieveResponse><numberOfRecords>${records.length}</numberOfRecords><records>${records
    .map((r) => `<record><recordData><record xmlns="http://www.loc.gov/MARC21/slim">${r}</record></recordData></record>`)
    .join("")}</records></searchRetrieveResponse>`;
const isbnField = (a: string) => `<datafield ind1=" " ind2=" " tag="020"><subfield code="a">${a}</subfield></datafield>`;
const ava = (sub: Record<string, string>) =>
  `<datafield ind1=" " ind2=" " tag="AVA">${Object.entries(sub).map(([c, v]) => `<subfield code="${c}">${v}</subfield>`).join("")}</datafield>`;

describe("parseAlmaResponse (live UMD responses)", () => {
  it("reads a checked-out holding and links the record", () => {
    expect(parse(fx("umd-catcher"), "9780316769488")).toEqual({
      found: true,
      copies: [{ branch: "UMCP McKeldin Library, Stacks", callNumber: "PS3537.A426 C3 1951", status: "unavailable", dueDate: null }],
      recordUrl: "https://usmai-umcp.primo.exlibrisgroup.com/discovery/fulldisplay?docid=alma990001199870108238&vid=01USMAI_UMCP:DEFAULT",
    });
  });

  it("matches the ISBN-10 form of the record's ISBN-13", () => {
    const r = parse(fx("umd-available"), "1912430118");
    expect(r.found).toBe(true);
    expect(r.copies.map((c) => c.status)).toEqual(["available"]);
    expect(r.recordUrl).toContain("docid=alma990061255570108238&");
  });

  it("drops records that only match a cancelled ISBN in 020 $z", () => {
    expect(parse(fx("umd-false-hit"), "9780000000002")).toEqual({ found: false, copies: [], recordUrl: null });
  });
});

describe("parseAlmaResponse", () => {
  it("is not found with no records", () => {
    expect(parse(wrap([]), "9780306406157").found).toBe(false);
  });

  it("splits a holding into its items, $g of them unavailable", () => {
    const r = parse(wrap([`<controlfield tag="001">991</controlfield>${isbnField("9780306406157 (pbk.)")}${ava({ q: "McKeldin", c: "Stacks", e: "available", f: "3", g: "1" })}`]), "9780306406157");
    expect(r.copies.map((c) => c.status)).toEqual(["available", "available", "unavailable"]);
  });

  it("falls back to $e when the item counts are missing or inconsistent, and decodes entities", () => {
    const r = parse(wrap([`${isbnField("9780306406157")}${ava({ q: "Art &amp; Architecture", e: "check_holdings" })}${ava({ q: "Main", e: "available", f: "1", g: "2" })}`]), "9780306406157");
    expect(r.copies).toEqual([
      { branch: "Art & Architecture", callNumber: null, status: "unknown", dueDate: null },
      { branch: "Main", callNumber: null, status: "available", dueDate: null },
    ]);
    expect(r.recordUrl).toBeNull();
  });

  it("throws on a response that isn't SRU", () => {
    expect(() => parse("<html>maintenance</html>", "9780306406157")).toThrow();
  });
});
