import type { LibraryAvailability } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import { searchByIsbn } from "../z3950/client.js";
import { parseRecord } from "../z3950/parse.js";
import { getZ3950Library } from "../z3950/registry.js";

// Memory only; a thrown Z3950UnavailableError propagates and is never cached.
const cache = new TtlCache<LibraryAvailability>(120_000, 500);

export async function getLibraryAvailability(libraryId: string, isbn: string, signal?: AbortSignal): Promise<LibraryAvailability | null> {
  const library = getZ3950Library(libraryId);
  if (!library) return null;
  const key = `${libraryId}:${isbn}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { found, copies } = parseRecord(await searchByIsbn(library, isbn, signal), library.holdings);
  const result: LibraryAvailability = { found, level: library.holdings !== "none" ? "availability" : "catalog", copies };
  cache.set(key, result);
  return result;
}
