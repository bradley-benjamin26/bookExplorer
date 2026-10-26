// How many years a cover is worth when ranking editions: a cover-bearing
// edition may sit this far behind an otherwise-newer one.
export const COVER_BOOST_YEARS = 2;

// Open Library dates are free text ("March 3, 2019", "1965", "n.d."), so take
// the last plausible 4-digit year.
export function publishYear(date: string | null): number | null {
  if (!date) return null;
  const years = [...date.matchAll(/\b(1[5-9]\d\d|20\d\d)\b/g)];
  return years.length ? Number(years[years.length - 1][1]) : null;
}

// English first, then newest, with a cover as a small boost. Array#sort is
// stable, so ties keep the input order.
export function orderEditions<T extends { nonEnglish: boolean; publishDate: string | null; coverUrl: string | null }>(
  editions: T[],
): T[] {
  const score = (e: T) => (publishYear(e.publishDate) ?? -Infinity) + (e.coverUrl ? COVER_BOOST_YEARS : 0);
  return [...editions].sort((a, b) => {
    if (a.nonEnglish !== b.nonEnglish) return Number(a.nonEnglish) - Number(b.nonEnglish);
    const sa = score(a);
    const sb = score(b);
    return sa === sb ? 0 : sa > sb ? -1 : 1;
  });
}
