import { describe, expect, it } from "vitest";
import { routes } from "./navigation";
import { relationHref } from "./relationHref";

const r = (relation: string, openLibraryId: string | null) => ({ relation, openLibraryId, label: "x" }) as never;

describe("relationHref", () => {
  it("links a notable work with a work id", () => {
    expect(relationHref(r("notableWork", "OL45883W"))).toEqual(routes.work("OL45883W"));
  });
  it("leaves a notable work with no id or an edition id as text", () => {
    expect(relationHref(r("notableWork", null))).toBeNull();
    expect(relationHref(r("notableWork", "OL123M"))).toBeNull();
  });
  it("links influence relations to an author or a work", () => {
    expect(relationHref(r("influencedBy", "OL26320A"))).toEqual(routes.author("OL26320A"));
    expect(relationHref(r("influenced", "OL1W"))).toEqual(routes.work("OL1W"));
  });
  it("links an award to its award page without an Open Library id", () => {
    expect(relationHref({ relation: "award", openLibraryId: null, label: "Hugo Award for Best Novel" } as never)).toEqual(routes.award("hugo_award", "Hugo Award"));
  });
  it("links a movement only when Wikidata gives its Open Library subject", () => {
    expect(relationHref({ relation: "movement", openLibraryId: null, openLibrarySubject: "romanticism_great_britain", label: "British Romanticism" })).toEqual(
      routes.subject("romanticism_great_britain", "British Romanticism")
    );
    expect(relationHref(r("movement", "OL1A"))).toBeNull();
  });
});
