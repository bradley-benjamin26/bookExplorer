import type { AwardWinner } from "@book-explorer/shared";

/** Splits winners by kind, keeping order; winners with no kind go in `others`. */
export function groupWinners(winners: AwardWinner[]) {
  return {
    authors: winners.filter((w) => w.kind === "author"),
    works: winners.filter((w) => w.kind === "work"),
    others: winners.filter((w) => w.kind === null),
  };
}
