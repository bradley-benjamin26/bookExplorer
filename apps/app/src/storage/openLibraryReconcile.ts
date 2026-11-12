import type { OpenLibraryList } from "@book-explorer/shared";
import type { ListMember, SavedList } from "./savedLists";

/** What a pull leaves on an Open Library-linked list: unpushed locals stay, locals removed remotely go, remote-only members are appended. */
export function reconcileOpenLibrary(local: ListMember[], remote: OpenLibraryList["seeds"], kind: SavedList["kind"], now: number): ListMember[] {
  const remoteSeeds = new Set(remote.map((s) => s.seed));
  const kept = local.filter((m) => m.openLibrarySeed === undefined || remoteSeeds.has(m.openLibrarySeed));
  const key = (m: { type: string; id: string }) => `${m.type}:${m.id}`;
  const seeds = new Set(kept.map((m) => m.openLibrarySeed));
  const ids = new Set(kept.map(key));
  const added: ListMember[] = [];
  // The sets grow as members are appended, so a repeated seed or two seeds for one member land once.
  for (const s of remote) {
    if (!s.member || (kind === "author") !== (s.member.type === "author") || seeds.has(s.seed) || ids.has(key(s.member))) continue;
    seeds.add(s.seed);
    ids.add(key(s.member));
    added.push({ ...s.member, title: s.title, openLibrarySeed: s.seed, addedAt: now });
  }
  return [...kept, ...added];
}
