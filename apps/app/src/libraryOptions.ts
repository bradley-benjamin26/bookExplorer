import type { SupportedLibrary } from "@book-explorer/shared";
import type { Library } from "./storage/librarySettings";

/** Supported libraries not yet added, in registry order. */
export function supportedLibraryOptions(supported: SupportedLibrary[], libraries: Library[]): SupportedLibrary[] {
  const added = new Set(libraries.map((l) => l.z3950Id));
  return supported.filter((s) => !added.has(s.id));
}
