import { describe, expect, it } from "vitest";
import { subjectDisplayName, subjectLabel, subjectSpokenLabel } from "./subjectLabel";

describe("subjectLabel", () => {
  it.each([
    ["Young adult fiction -- Historical -- Medieval", "Young Adult Fiction->Historical->Medieval"],
    ["Science fiction--Authorship", "Science Fiction->Authorship"],
    ["Fiction, Historical", "Fiction->Historical"],
    ["Coming-of-age", "Coming-of-Age"],
    ["science fiction", "Science Fiction"],
    ["Fiction -- ", "Fiction"],
    // Person-name headings split too; display only, accepted.
    ["Austen, Jane, 1775-1817 -- Criticism", "Austen->Jane->1775-1817->Criticism"],
  ])("%s", (input, expected) => expect(subjectLabel(input)).toBe(expected));
});

describe("subjectSpokenLabel", () => {
  it("joins parts with commas for screen readers", () => {
    expect(subjectSpokenLabel("Fiction -- Historical")).toBe("Fiction, Historical");
  });
});

describe("subjectDisplayName", () => {
  const slug = "young_adult_fiction_historical_medieval";
  const server = "young adult fiction historical medieval";
  it("uses the label when it matches the slug", () => {
    expect(subjectDisplayName(slug, server, "Young adult fiction, Historical, Medieval")).toBe("Young adult fiction, Historical, Medieval");
  });
  it("falls back to the server name otherwise", () => {
    expect(subjectDisplayName(slug, server, "Something else")).toBe(server);
    expect(subjectDisplayName(slug, server)).toBe(server);
  });
});
