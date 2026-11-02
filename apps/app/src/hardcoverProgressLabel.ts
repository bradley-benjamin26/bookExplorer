import type { HardcoverProgress } from "@book-explorer/shared";

/** Copy for the Hardcover reading line on book and work pages; null when there is nothing to show. */
export function progressLabel(p: HardcoverProgress): string | null {
  switch (p.status) {
    case "want":
      return "On your Want to Read shelf";
    case "reading":
      return p.percent != null ? `Reading · ${Math.round(p.percent)}%` : "Currently reading";
    case "read":
      return "Read";
    case "paused":
      return "Paused";
    case "dnf":
      return "Did not finish";
    default:
      return null;
  }
}

/** Screen-reader text for the progress row, whose visible "on Hardcover" is the logo. */
export function progressSpokenLabel(label: string): string {
  return `${label} on Hardcover`;
}
