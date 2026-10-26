import { describe, expect, it } from "vitest";
import { COVER_BOOST_YEARS, orderEditions, publishYear } from "./editionOrder.js";

describe("publishYear", () => {
  it("reads the year out of a full date", () => {
    expect(publishYear("March 3, 2019")).toBe(2019);
  });

  it("reads a bare year", () => {
    expect(publishYear("1965")).toBe(1965);
  });

  it("returns null when there is no year", () => {
    expect(publishYear("n.d.")).toBeNull();
    expect(publishYear(null)).toBeNull();
  });
});

describe("orderEditions", () => {
  const edition = (id: string, extra: Partial<{ nonEnglish: boolean; publishDate: string | null; coverUrl: string | null }> = {}) => ({
    id,
    nonEnglish: false,
    publishDate: null as string | null,
    coverUrl: null as string | null,
    ...extra,
  });

  it("puts every English edition before any non-English one", () => {
    const result = orderEditions([
      edition("fr-new", { nonEnglish: true, publishDate: "2024" }),
      edition("en-old", { publishDate: "1990" }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["en-old", "fr-new"]);
  });

  it("orders newer first within a language group", () => {
    const result = orderEditions([
      edition("2010", { publishDate: "2010" }),
      edition("2019", { publishDate: "2019" }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["2019", "2010"]);
  });

  it("gives a cover a small boost of COVER_BOOST_YEARS", () => {
    expect(COVER_BOOST_YEARS).toBe(2);
    const result = orderEditions([
      edition("2019-no-cover", { publishDate: "2019" }),
      edition("2010-cover", { publishDate: "2010", coverUrl: "https://covers/x.jpg" }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["2019-no-cover", "2010-cover"]);

    const boosted = orderEditions([
      edition("2019-no-cover", { publishDate: "2019" }),
      edition("2018-cover", { publishDate: "2018", coverUrl: "https://covers/y.jpg" }),
    ]);
    expect(boosted.map((e) => e.id)).toEqual(["2018-cover", "2019-no-cover"]);
  });

  it("sorts an edition with no year after dated ones", () => {
    const result = orderEditions([
      edition("undated"),
      edition("1900", { publishDate: "1900" }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["1900", "undated"]);
  });

  it("keeps input order for ties", () => {
    const result = orderEditions([
      edition("first", { publishDate: "2000" }),
      edition("second", { publishDate: "2000" }),
      edition("third", { publishDate: "2000" }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["first", "second", "third"]);
  });
});
