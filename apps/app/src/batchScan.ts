import { normalizeIsbn } from "@book-explorer/shared";

export const DEBOUNCE_MS = 2000;

/** True for a 13-digit 978/979 EAN with a valid check digit; filters out price/other barcodes. */
export function isIsbnBarcode(data: string): boolean {
  if (!/^97[89]\d{10}$/.test(data)) return false;
  const sum = [...data.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(data[12]);
}

/**
 * The ISBN to capture for a camera read, or null to ignore it: not an ISBN
 * barcode, or the same code was read within the debounce window. `lastSeen`
 * is mutated (any valid read, accepted or not, refreshes its timestamp so a
 * barcode held in frame stays quiet).
 */
export function acceptScan(lastSeen: Map<string, number>, data: string, now: number): string | null {
  if (!isIsbnBarcode(data)) return null;
  const prev = lastSeen.get(data);
  lastSeen.set(data, now);
  return prev !== undefined && now - prev < DEBOUNCE_MS ? null : data;
}

/** Typed entry for screen-reader users; accepts ISBN-13 only, same rule as the camera. */
export function parseTypedIsbn(raw: string): string | null {
  const isbn = normalizeIsbn(raw);
  return isIsbnBarcode(isbn) ? isbn : null;
}

export type SaveOutcome = "saved" | "failed";

/** Saves each item independently so one failure doesn't lose the rest. */
export async function saveAll<T extends { isbn: string }>(
  items: T[],
  saveOne: (item: T) => Promise<unknown>
): Promise<Record<string, SaveOutcome>> {
  const out: Record<string, SaveOutcome> = {};
  for (const item of items) {
    try {
      await saveOne(item);
      out[item.isbn] = "saved";
    } catch {
      out[item.isbn] = "failed";
    }
  }
  return out;
}
