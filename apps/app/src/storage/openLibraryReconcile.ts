import type { OpenLibraryList } from "@book-explorer/shared";
import type { ListMember, SavedList } from "./savedLists";

/** What a pull leaves on an Open Library-linked list: unpushed locals stay, locals removed remotely go, remote-only members are appended. */
export function reconcileOpenLibrary(local: ListMember[], remote: OpenLibraryList["seeds"], kind: SavedList["kind"], now: number): ListMember[] {
  const remoteSeeds = new Set(remote.map((s) => s.seed));
  const kept = local.filter((m) => m.openLibrarySeed === undefined || remoteSeeds.has(m.openLibrarySeed));
  const seeds = new Set(kept.map((m) => m.openLibrarySeed));
  const ids = new Set(kept.map((m) => `${m.type}:${m.id}`));
  const added = remote.flatMap((s): ListMember[] =>
    s.member && (kind === "author" ? s.member.type === "author" : s.member.type !== "author") && !seeds.has(s.seed) && !ids.has(`${s.member.type}:${s.member.id}`)
      ? [{ ...s.member, title: s.title, openLibrarySeed: s.seed, addedAt: now }]
      : []
  );
  return [...kept, ...added];
}
