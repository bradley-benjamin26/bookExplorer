import { afterEach, describe, expect, it, vi } from "vitest";
import { getWork } from "./openLibrary.js";

function mockWork(title: string, editions: { title: string; languages?: string[]; covers?: number[] }[], workCovers?: number[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("/editions.json")
          ? {
              entries: editions.map((e, i) => ({
                key: `/books/OL${i}M`,
                title: e.title,
                isbn_13: [`978000000000${i}`],
                languages: e.languages?.map((l) => ({ key: `/languages/${l}` })),
                covers: e.covers,
              })),
            }
          : { title, covers: workCovers },
    }))
  );
}

describe("getWork's title", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the English editions' title when none of them carries the work's original-language title", async () => {
    mockWork("Le capital au XXIe siècle", [
      { title: "Le capital au XXIe siècle", languages: ["fre"] },
      { title: "Capital In the 21st Century", languages: ["eng"] },
      { title: "Capital in the Twenty-First Century", languages: ["eng"] },
      { title: "Capital in the twenty-first century", languages: ["eng"] },
      { title: "Capital en el siglo XXI" },
    ]);
    expect((await getWork("OL16814568W"))?.title).toBe("Capital in the Twenty-First Century");
  });

  it("keeps the work's title when an English edition carries it", async () => {
    mockWork("Harry Potter and the Philosopher's Stone", [
      { title: "Harry Potter and the Sorcerer's Stone", languages: ["eng"] },
      { title: "Harry Potter and the Sorcerer's Stone", languages: ["eng"] },
      { title: "Harry Potter and the Philosopher's Stone", languages: ["eng"] },
    ]);
    expect((await getWork("OL82563W"))?.title).toBe("Harry Potter and the Philosopher's Stone");
  });

  it("keeps the work's title when no edition is labelled English", async () => {
    mockWork("Les Misérables", [{ title: "Les Misérables", languages: ["fre"] }, { title: "Les Miserables" }]);
    expect((await getWork("OL1W"))?.title).toBe("Les Misérables");
  });
});

describe("getWork's cover", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const L = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;
  it("prefers an English edition's cover over the work's first cover", async () => {
    mockWork("Le capital au XXIe siècle", [
      { title: "Le capital au XXIe siècle", languages: ["fre"], covers: [111] },
      { title: "Capital in the Twenty-First Century", languages: ["eng"], covers: [222] },
    ], [111]);
    expect((await getWork("OL16814568W"))?.coverUrl).toBe(L(222));
  });
  it("skips English editions without a cover", async () => {
    mockWork("X", [{ title: "X", languages: ["eng"] }, { title: "X", languages: ["eng"], covers: [-1, 333] }], [111]);
    expect((await getWork("OL1W"))?.coverUrl).toBe(L(333));
  });
  it("keeps the work's cover when no English edition has one", async () => {
    mockWork("Les Misérables", [{ title: "Les Misérables", languages: ["fre"], covers: [444] }, { title: "Les Miserables", covers: [555] }], [111]);
    expect((await getWork("OL1W"))?.coverUrl).toBe(L(111));
  });
  it("keeps the work's cover when editions aren't fetched", async () => {
    mockWork("X", [{ title: "X", languages: ["eng"], covers: [222] }], [111]);
    expect((await getWork("OL1W", { editions: false }))?.coverUrl).toBe(L(111));
  });
});
