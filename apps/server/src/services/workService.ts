import type { Work } from "@book-explorer/shared";
import { TtlCache } from "../cache.js";
import * as openLibrary from "../sources/openLibrary.js";

const workCache = new TtlCache<Work | null>(1000 * 60 * 60);

/** Shared by the /api/works and /api/graph/work routes so both hit the same cache. */
export function getWorkDetail(workId: string): Promise<Work | null> {
  return workCache.wrap(workId, async () => {
    const ol = await openLibrary.getWork(workId);
    if (!ol) return null;
    const result: Work = { openLibraryWorkId: workId, ...ol };
    return result;
  });
}
