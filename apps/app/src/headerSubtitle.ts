// Pages that are places in their own right, so the header names them under the wordmark.
// Detail pages (Book, Author, ...) stay wordmark-only; their content carries the title.
const UTILITY_PAGES = new Set([
  "Settings",
  "Lists",
  "Import & Export",
  "Recommendations",
  "My Library",
  "About",
  "My Hardcover Account",
]);

export const headerSubtitle = (routeTitle: string): string | null => (UTILITY_PAGES.has(routeTitle) ? routeTitle : null);
