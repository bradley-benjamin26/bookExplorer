// Hand-rolled join: Intl.ListFormat isn't guaranteed on Hermes.
export function coverAlt(title: string, authorNames: string[]): string {
  const base = `Book cover of ${title}`;
  if (authorNames.length === 0) return base;
  const joined = authorNames.length === 1 ? authorNames[0] : `${authorNames.slice(0, -1).join(", ")} and ${authorNames[authorNames.length - 1]}`;
  return `${base} by ${joined}`;
}
