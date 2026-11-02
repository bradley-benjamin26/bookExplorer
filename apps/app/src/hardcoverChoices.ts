import type { HardcoverListSummary } from "@book-explorer/shared";
import type { SavedList } from "./storage/savedLists";

/** The remote lists not yet linked to a local list, in remote order. */
export function hardcoverChoices(remote: HardcoverListSummary[], local: SavedList[]): HardcoverListSummary[] {
  const linked = new Set(local.map((l) => l.hardcoverListId));
  return remote.filter((r) => !linked.has(r.id));
}

/** The ticked ids still offered, so a list imported before a failed Done is not imported again. */
export function keepOffered(checked: Set<number>, choices: HardcoverListSummary[]): Set<number> {
  return new Set(choices.filter((c) => checked.has(c.id)).map((c) => c.id));
}
