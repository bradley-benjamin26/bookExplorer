import { awardDisplayName, awardSlug, type Award, type AwardWinner } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as wikidata from "../sources/wikidata.js";
import { optionalSource } from "./bookEnrichment.js";

const MAX_WINNERS = 40;
const awardCache = new TtlCache<Award>(1000 * 60 * 60 * 24, 500, "award");

function kindOf(openLibraryId: string | null): AwardWinner["kind"] {
  if (openLibraryId?.endsWith("A")) return "author";
  if (openLibraryId?.endsWith("W")) return "work";
  return null;
}

/** Never "not found": an award Wikidata doesn't know comes back empty but valid. */
export function getAwardDetail(slug: string, label?: string): Promise<Award> {
  const name = label
    ? awardDisplayName(label)
    : slug.replace(/_/g, " ").replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  const canonical = label ? awardSlug(label) : slug;
  return awardCache.wrap(canonical, async (entry) => {
    const qid = await wikidata.searchAwardQid(name).catch(optionalSource<string | null>(entry, "wikidata award search", null));
    const [description, winners] = qid
      ? await Promise.all([
          wikidata.fetchDescription(qid).catch(optionalSource<string | null>(entry, "wikidata award description", null)),
          wikidata.fetchAwardWinners(qid).catch(optionalSource<Awaited<ReturnType<typeof wikidata.fetchAwardWinners>>>(entry, "wikidata award winners", [])),
        ])
      : [null, []];
    return {
      slug: canonical,
      name,
      wikidataId: qid,
      description,
      winners: winners.slice(0, MAX_WINNERS).map((w) => ({ ...w, kind: kindOf(w.openLibraryId) })),
    };
  });
}
