export type ExportFormat = "json" | "csv";

/** File name and mime for a download; identical to what the separate Export buttons produced. */
export function exportFileInfo(format: ExportFormat, day: string): { name: string; mime: string } {
  return format === "json"
    ? { name: `book-explorer-${day}.json`, mime: "application/json" }
    : { name: `book-explorer-books-${day}.csv`, mime: "text/csv" };
}
