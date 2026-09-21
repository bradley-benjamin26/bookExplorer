import { fetchWithTimeout } from "../httpClient.js";
import { USER_AGENT } from "./openLibrary.js";
import { isValidQid } from "./wikidata.js";

export interface WikipediaExtract {
  text: string;
  url: string;
}

interface SitelinksResponse {
  entities?: Record<string, { sitelinks?: { enwiki?: { title?: string } } }>;
}

async function getEnglishWikipediaTitle(qid: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata sitelinks request failed: ${res.status}`);
  const data = (await res.json()) as SitelinksResponse;
  return data.entities?.[qid]?.sitelinks?.enwiki?.title ?? null;
}

interface PageSummary {
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/**
 * The opening paragraph(s) of an author's English Wikipedia article, via
 * Wikidata's sitelink to find the right title and Wikipedia's own REST
 * "page summary" endpoint (which returns just the lead section as plain
 * text, not the full article) to fetch it. Returns null when there's
 * genuinely no English Wikipedia article for this QID — a real fetch
 * failure (network error, non-404 bad response) is left to throw rather
 * than being swallowed, matching authorService's reasoning for not letting
 * a transient failure get cached as a false "nothing here."
 */
export async function fetchWikipediaExtract(qid: string): Promise<WikipediaExtract | null> {
  if (!isValidQid(qid)) return null;

  const title = await getEnglishWikipediaTitle(qid);
  if (!title) return null;

  const res = await fetchWithTimeout(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia summary request failed: ${res.status}`);

  const data = (await res.json()) as PageSummary;
  const text = data.extract?.trim();
  if (!text) return null;

  return { text, url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}
