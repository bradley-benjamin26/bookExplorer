import type { Href } from "expo-router";

export const WEB_ORIGIN = "https://shelfthread.com";

/** The page's own origin on web (so dev and preview hosts share their own links); native has none, so it uses WEB_ORIGIN. */
function currentOrigin(): string {
  const origin = (globalThis as { location?: { origin?: unknown } }).location?.origin;
  return typeof origin === "string" && /^https?:\/\//.test(origin) ? origin : WEB_ORIGIN;
}

/** Builds the public web URL for a `routes.*` href (object form, or a plain path like "/saved"). */
export function webUrl(href: Href, origin: string = currentOrigin()): string {
  if (typeof href === "string") return origin + "/" + href.replace(/^\//, "");
  const { pathname, params = {} } = href as { pathname: string; params?: Record<string, string> };
  const rest = { ...params };
  const path = pathname.replace(/\[(\w+)\]/g, (_, key) => {
    const value = rest[key];
    delete rest[key];
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams(rest).toString();
  return origin + "/" + path.replace(/^\//, "") + (query ? `?${query}` : "");
}

/**
 * What to announce after a share attempt: "Link copied" when `share` resolved true (it copied to the
 * clipboard rather than opening a share sheet), nothing for a share sheet or one the user dismissed
 * (AbortError), and "Couldn't share" for any other failure.
 */
export async function shareFeedback(share: () => Promise<boolean>): Promise<string> {
  try {
    return (await share()) ? "Link copied" : "";
  } catch (err) {
    return err instanceof Error && err.name === "AbortError" ? "" : "Couldn't share";
  }
}
