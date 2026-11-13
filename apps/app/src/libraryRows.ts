// "Lists" has no row: My Library shows the lists themselves, with a "See all lists" link.
export const LIBRARY_PRIMARY = [
  { id: "hardcover", label: "Hardcover account" },
  { id: "openlibrary", label: "My Open Library Account" },
  { id: "recommendations", label: "Recommendations" },
  { id: "connection", label: "Find connection" },
] as const;

export const LIBRARY_TOOLS = [
  { id: "backup", label: "Import & export" },
  { id: "settings", label: "Settings" },
] as const;

// My Library leads with the reader's own lists; accounts sit below them.
export const ACCOUNT_ROWS = LIBRARY_PRIMARY.slice(0, 2);
export const DISCOVERY_ROWS = LIBRARY_PRIMARY.slice(2);
