// "Lists" has no row: My Library shows the lists themselves, with a "See all lists" link.
export const LIBRARY_PRIMARY = [
  { id: "hardcover", label: "Hardcover account" },
  { id: "recommendations", label: "Recommendations" },
  { id: "connection", label: "Find connection" },
] as const;

export const LIBRARY_TOOLS = [
  { id: "backup", label: "Import & export" },
  { id: "settings", label: "Settings" },
] as const;
