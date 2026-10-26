// Subject and genre terms arrive in whatever case their source used (Open
// Library's lowercase, LCSH's sentence case, the occasional ALL CAPS), so
// they're normalized to one style at display time rather than shown as-is.
const SMALL_WORDS = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "of", "in", "on", "at", "to", "by", "up", "as", "vs", "de", "del", "la", "el", "y", "e", "et", "du", "des", "les"]);
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Title-cases a term: small words ("of", "the", ...) stay lowercase unless
 * first or last, and a word that already mixes case ("iPhone", "McDonald",
 * "WWII" inside a longer label) is left alone. A label that is entirely
 * upper case is treated as shouting rather than acronyms and lowercased
 * first, so "SCIENCE FICTION" and "science fiction" both become "Science Fiction".
 */
export function titleCase(label: string): string {
  const source = label === label.toUpperCase() ? label.toLowerCase() : label;
  const words = [...source.matchAll(WORD)];
  let result = "";
  let cursor = 0;
  words.forEach((match, i) => {
    const word = match[0];
    const start = match.index ?? 0;
    result += source.slice(cursor, start);
    cursor = start + word.length;

    const hasInnerCapital = word !== word.toLowerCase() && word !== capitalize(word.toLowerCase());
    const isEdge = i === 0 || i === words.length - 1;
    if (hasInnerCapital) result += word;
    else if (!isEdge && SMALL_WORDS.has(word.toLowerCase())) result += word.toLowerCase();
    else result += capitalize(word.toLowerCase());
  });
  return result + source.slice(cursor);
}
