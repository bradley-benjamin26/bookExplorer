import type { LibraryAvailability } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import { getAlmaLibrary, searchAlmaByIsbn } from "../sources/almaSru.js";
import { searchByIsbn } from "../z3950/client.js";
import { parseRecord } from "../z3950/parse.js";
import { getZ3950Library } from "../z3950/registry.js";

// Memory only; a thrown Z3950UnavailableError or UpstreamUnavailableError propagates and is never cached.
const cache = new TtlCache<LibraryAvailability>(120_000, 500);

async function lookup(libraryId: string, isbn: string, signal?: AbortSignal): Promise<LibraryAvailability | null> {
  const alma = getAlmaLibrary(libraryId);
  if (alma) return { level: "availability", ...(await searchAlmaByIsbn(alma, isbn)) };
  const library = getZ3950Library(libraryId);
  if (!library) return null;
  const { found, copies } = parseRecord(await searchByIsbn(library, isbn, signal), library.holdings);
  const level = library.holdings !== "none" ? "availability" : "catalog";
  return { found, level, copies, recordUrl: found && library.recordUrl ? library.recordUrl(isbn) : null };
}

export async function getLibraryAvailability(libraryId: string, isbn: string, signal?: AbortSignal): Promise<LibraryAvailability | null> {
  const key = `${libraryId}:${isbn}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = await lookup(libraryId, isbn, signal);
  if (result) cache.set(key, result);
  return result;
}
