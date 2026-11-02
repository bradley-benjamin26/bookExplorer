import type { HardcoverListSummary } from "@book-explorer/shared";
import type { SavedList } from "./storage/savedLists";

/** The remote lists not yet linked to a local list, in remote order. */
export function hardcoverChoices(remote: HardcoverListSummary[], local: SavedList[]): HardcoverListSummary[] {
  const linked = new Set(local.map((l) => l.hardcoverListId));
  return remote.filter((r) => !linked.has(r.id));
}

/** The ids of lists that don't already hold the member, so it isn't added (and pushed) twice. */
export function listsNotHolding(lists: SavedList[], member: { type: string; id: string }, ids: string[]): string[] {
  const holders = new Set(lists.filter((l) => l.members.some((m) => m.type === member.type && m.id === member.id)).map((l) => l.id));
  return ids.filter((id) => !holders.has(id) && lists.some((l) => l.id === id));
}

/** Local lists linked to the ticked Hardcover ids, i.e. the ones a (partly failed) import created. */
export function linkedTo(remoteChecked: Set<number>, lists: SavedList[]): string[] {
  return lists.filter((l) => l.hardcoverListId !== undefined && remoteChecked.has(l.hardcoverListId)).map((l) => l.id);
}

/** The ticked ids still offered, so a list imported before a failed Done is not imported again. */
export function keepOffered(checked: Set<number>, choices: HardcoverListSummary[]): Set<number> {
  return new Set(choices.filter((c) => checked.has(c.id)).map((c) => c.id));
}
