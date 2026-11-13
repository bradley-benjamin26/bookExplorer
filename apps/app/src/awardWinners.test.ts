import type { AwardWinner } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { groupWinners } from "./awardWinners";

const w = (kind: AwardWinner["kind"], label: string): AwardWinner => ({ kind, openLibraryId: null, wikidataId: "Q1", label });

describe("groupWinners", () => {
  it("splits winners into authors, works and others, keeping order", () => {
    const [a1, w1, o1, a2, w2] = [w("author", "A1"), w("work", "W1"), w(null, "O1"), w("author", "A2"), w("work", "W2")];
    expect(groupWinners([a1, w1, o1, a2, w2])).toEqual({ authors: [a1, a2], works: [w1, w2], others: [o1] });
  });
  it("returns three empty groups for no winners", () => {
    expect(groupWinners([])).toEqual({ authors: [], works: [], others: [] });
  });
});
