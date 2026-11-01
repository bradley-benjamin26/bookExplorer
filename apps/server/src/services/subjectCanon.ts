import { slugifySubject, subjectKey } from "@book-explorer/shared";
import { TtlCache, type CacheEntryOptions } from "../cache.js";
import { UpstreamUnavailableError } from "../httpClient.js";
import * as locLinkedData from "../sources/locLinkedData.js";

export interface CanonicalSubject {
  uri: string;
  heading: string;
  display: string;
  slug: string;
  variants: string[];
}

const CANONICAL_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const FAILED_LOOKUP_TTL_MS = 60_000;
const MAX_PARALLEL_LOOKUPS = 8;

interface CachedCanonicalSubject {
  canonical: CanonicalSubject | null;
  failed: boolean;
}

const subjectCanonCache = new TtlCache<CachedCanonicalSubject>(CANONICAL_TTL_MS, 2000, "subjectCanon");

export async function canonicalizeSubjects(
  labels: string[],
  callerEntry?: CacheEntryOptions
): Promise<Map<string, CanonicalSubject | null>> {
  const distinct = new Map<string, string>();
  for (const label of labels) {
    const key = subjectKey(label);
    if (key && !distinct.has(key)) distinct.set(key, label);
  }

  const byKey = new Map<string, CanonicalSubject | null>();
  const entries = [...distinct];
  for (let offset = 0; offset < entries.length; offset += MAX_PARALLEL_LOOKUPS) {
    await Promise.all(
      entries.slice(offset, offset + MAX_PARALLEL_LOOKUPS).map(async ([key, label]) => {
        const cached = await subjectCanonCache.wrap(key, async (entry) => {
          try {
            const result = await locLinkedData.findSubjectHeadingWithStatus(label);
            if (result.failed) {
              entry.ttlMs = FAILED_LOOKUP_TTL_MS;
              if (result.error && !(result.error instanceof UpstreamUnavailableError)) {
                console.warn(`[loc subject canonicalization] Optional lookup failed for "${label}":`, result.error);
              }
              return { canonical: null, failed: true };
            }
            if (!result.heading) return { canonical: null, failed: false };
            return {
              canonical: {
                uri: result.heading.uri,
                heading: result.heading.heading,
                display: locLinkedData.naturalSubjectLabel(result.heading.heading, result.heading.variants),
                slug: slugifySubject(result.heading.heading),
                variants: result.heading.variants,
              },
              failed: false,
            };
          } catch (error) {
            entry.ttlMs = FAILED_LOOKUP_TTL_MS;
            if (!(error instanceof UpstreamUnavailableError)) {
              console.warn(`[loc subject canonicalization] Optional lookup failed for "${label}":`, error);
            }
            return { canonical: null, failed: true };
          }
        });
        if (cached.failed && callerEntry) callerEntry.ttlMs = Math.min(callerEntry.ttlMs, FAILED_LOOKUP_TTL_MS);
        byKey.set(key, cached.canonical);
      })
    );
  }

  const result = new Map<string, CanonicalSubject | null>();
  for (const label of labels) result.set(label, byKey.get(subjectKey(label)) ?? null);
  return result;
}
