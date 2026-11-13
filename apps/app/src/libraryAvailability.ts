import type { LibraryAvailability } from "@book-explorer/shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 25" from an ISO YYYY-MM-DD, read from its parts so no timezone can shift the day. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** One line for the book page, or null when there is nothing honest to say (not found). */
export function availabilityLine(a: LibraryAvailability): string | null {
  if (!a.found) return null;
  if (a.level === "catalog") return "In the catalog";
  const open = a.copies.filter((c) => c.status === "available").length;
  if (open > 0) return `${open} of ${a.copies.length} copies available`;
  const due = a.copies.flatMap((c) => (c.dueDate ? [c.dueDate] : [])).sort()[0];
  return due ? `No copies on the shelf. Next due ${shortDate(due)}` : "No copies on the shelf";
}
