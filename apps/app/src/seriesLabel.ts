/** Screen-reader label for a series row; the visual "You are here" marker is mirrored here. Null outside a series. */
export function seriesRowLabel(title: string, series?: { position: string | null; current: boolean }): string | null {
  if (!series) return null;
  return [series.position && `Book ${series.position}`, title, series.current && "you are here"].filter(Boolean).join(", ");
}
