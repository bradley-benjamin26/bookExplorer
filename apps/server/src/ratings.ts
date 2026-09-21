import type { Rating } from "@book-explorer/shared";

interface RatingInput {
  average: number;
  count: number;
  source: Rating["sources"][number];
}

/**
 * Blends any number of same-shaped rating pools (Hardcover, Open Library, …)
 * into a single count-weighted average, rather than picking just one — a
 * source with 3,000 ratings and one with 12 shouldn't count equally toward
 * the combined number. Sources with no ratings at all are dropped before
 * blending rather than treated as a 0-star vote.
 */
export function combineRatings(...inputs: (RatingInput | null | undefined)[]): Rating | null {
  const valid = inputs.filter((r): r is RatingInput => !!r && r.count > 0);
  if (valid.length === 0) return null;

  const count = valid.reduce((sum, r) => sum + r.count, 0);
  const average = valid.reduce((sum, r) => sum + r.average * r.count, 0) / count;

  return { average, count, sources: valid.map((r) => r.source) };
}
