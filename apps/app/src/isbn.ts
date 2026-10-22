import { normalizeIsbn } from "@book-explorer/shared";

/**
 * The other form of the same ISBN (10 to 13 or 13 to 10), or null when the
 * input isn't a well-formed ISBN or has no counterpart — 979-prefixed
 * ISBN-13s never had an ISBN-10. Check digits aren't validated on input; the
 * output's is always recomputed.
 */
export function toAlternateIsbn(raw: string): string | null {
  const isbn = normalizeIsbn(raw);
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const body = `978${isbn.slice(0, 9)}`;
    const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
    return body + ((10 - (sum % 10)) % 10);
  }
  if (/^978\d{10}$/.test(isbn)) {
    const body = isbn.slice(3, 12);
    const sum = [...body].reduce((s, d, i) => s + Number(d) * (10 - i), 0);
    const check = (11 - (sum % 11)) % 11;
    return body + (check === 10 ? "X" : check);
  }
  return null;
}
