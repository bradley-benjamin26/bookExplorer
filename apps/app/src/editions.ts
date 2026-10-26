import type { Edition } from "@book-explorer/shared";

// Open Library lists dozens of print-on-demand reprints of public-domain
// books under these imprints that can't actually be found anywhere — kept
// reachable (real self-published work lives there too) but out of the way.
const SELF_PUBLISHED = /createspace|independent(ly)?[ -]publish/i;

/** How many self-published editions show before the rest collapse behind "view more". */
export const SELF_PUBLISHED_VISIBLE = 3;

export const isSelfPublished = (edition: Edition) => SELF_PUBLISHED.test(edition.publisher ?? "");

/**
 * Splits editions into those shown by default and the self-published ones
 * hidden past the first few, preserving the original order. `hiddenCount`
 * is 0 when there are few enough that nothing needs collapsing.
 */
export function collapseSelfPublished(editions: Edition[]): { shown: Edition[]; hiddenCount: number } {
  let seen = 0;
  const shown = editions.filter((e) => !isSelfPublished(e) || ++seen <= SELF_PUBLISHED_VISIBLE);
  return { shown, hiddenCount: editions.length - shown.length };
}
