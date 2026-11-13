# Deploying link-preview cards

Shared links (`/work/...`, `/book/...`, `/author/...`, `/subject/...`, `/graph/...`) show a title, description and image in chat and social apps. The static site can't do that per page, so the API server renders the tags for crawlers only. On book, work, author and subject pages it also adds schema.org JSON-LD describing the item, for search engines. People's page loads stay static and fast.

## Server

Point the server at the exported web app's `index.html`:

```
WEB_INDEX_HTML=/var/www/shelfthread/index.html
# optional, defaults to https://shelfthread.com
PUBLIC_WEB_URL=https://shelfthread.com
```

`GET /og/<page path>` then returns that file with the page's tags swapped in between its `<!-- social:start -->` and `<!-- social:end -->` markers. These routes skip the app-key check, since crawlers send no key. Without `WEB_INDEX_HTML` the route is not registered.

## Caddy

Replace the shelfthread.com site block with:

```
shelfthread.com {
    root * /var/www/shelfthread

    @preview {
        header_regexp ua User-Agent (?i)(googlebot|google-inspectiontool|bingbot|duckduckbot|applebot|yandexbot|twitterbot|facebookexternalhit|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|redditbot|bluesky|mastodon|embedly|pinterest|skypeuripreview|iframely)
        path / /work/* /book/* /author/* /subject/* /graph/*
    }
    handle @preview {
        rewrite * /og{uri}
        reverse_proxy 127.0.0.1:3001 {
            header_up X-Forwarded-For {header.CF-Connecting-IP}
        }
    }
    handle {
        try_files {path} /index.html
        file_server
    }
}
```

Then `sudo caddy validate --config /etc/caddy/Caddyfile` and `sudo systemctl reload caddy`.

- **Why the `handle` blocks:** Caddy runs a top-level `try_files` before any `handle`, wherever it appears in the block. Left at the top level it would rewrite `/work/OL1W` to `/index.html` first, and `@preview` would never match. Inside `handle` blocks, which are tried in order with only one running, crawlers on page paths go to the server and everything else is served statically as before.
- **Why the `path` line:** both conditions in `@preview` must hold. Crawlers fetch `og:image` with their own User-Agent, so without it `/og-image.png` would be rewritten to an HTML page, and a CDN might cache that HTML at the image URL.
- **Why `header_up`:** see "Rate limiting" below; the api.shelfthread.com block already has the same line.

## Cloudflare

Today the site answers non-browser requests with a challenge (403, `cf-mitigated: challenge`), which also blocks these crawlers.

1. Find what issues it: Security > Events, filter on a challenged request, and read the "Service" column (managed rules, Bot Fight Mode, Browser Integrity Check, security level…). To reproduce it, paste a page URL into Facebook's Sharing Debugger (developers.facebook.com/tools/debug) and opengraph.xyz, then look in Security > Events for challenged requests from those fetches.
2. Add a WAF custom rule for shelfthread.com: expression `(cf.client.bot)` ("Known Bots" in the rule builder), action **Skip**, and tick every component the events showed. Verified bots only: the rule can't be spoofed with a User-Agent.
3. If the service is **Bot Fight Mode** on the Free plan, a Skip rule can't bypass it; turn it off under Security > Bots, or previews stay blocked.

Discord, Telegram, WhatsApp and Mastodon fetchers aren't all Cloudflare "known bots". If their previews fail while X and Facebook work, add their User-Agents to the Skip rule's expression, e.g. `(cf.client.bot or http.user_agent contains "Discordbot" or http.user_agent contains "TelegramBot")`. User-Agents can be faked, so this lets anyone using those strings past the challenge; they still only reach static pages and `/og`.

## Content-Security-Policy

The policy blocks script the app didn't ship, which is what would otherwise reach a reader's session. Cloudflare sets it, not Caddy: Rules > Transform Rules > HTTP Response Header Transform Rule "CSP", for `Hostname equals shelfthread.com`, **Set static** with this value:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com; connect-src 'self' https://api.shelfthread.com https://fastly.jsdelivr.net https://cloudflareinsights.com; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

The header name is `Content-Security-Policy-Report-Only` while testing, then `Content-Security-Policy`. Why each source is there:

- `script-src`: the app's own bundle, plus the Cloudflare Web Analytics beacon. `'wasm-unsafe-eval'` lets the web barcode scanner (zxing-wasm) compile its WebAssembly; it does not allow `eval`.
- `connect-src`: the API, jsDelivr (the scanner fetches its `.wasm` from `fastly.jsdelivr.net`), and the beacon's reporting endpoint.
- `img-src https:`: covers and author photos come from many hosts (Open Library, Google Books, Hardcover, Wikimedia). Images can't run script.
- `style-src 'unsafe-inline'`: React Native Web writes its styles into `<style>` tags at runtime.

If you turn off Cloudflare Web Analytics (Cloudflare > the site > Analytics & Logs > Web Analytics, or Speed > Optimization "Automatic RUM"), remove `https://static.cloudflareinsights.com` and `https://cloudflareinsights.com`.

Rolling it out:

1. Cloudflare's Page Shield (script monitoring) adds its own report-only policy (`script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'`, reporting to `cdn-cgi/script_monitor`). It never blocks anything, and the browser checks each policy on its own, so it can stay. In the console, ignore violations that quote it and act only on ones that quote this policy. Caddy doesn't send it: `curl -I --resolve shelfthread.com:443:127.0.0.1 https://shelfthread.com/` on the Droplet shows no CSP header.
2. Deploy the rule as report-only, then browse every screen: home, search, a book, a work, an author, a graph, the scanner, Settings, and connecting Hardcover and Open Library. Read the console's violation lines.
3. Add any legitimate source the violations name. Script that Cloudflare injects inline (bot or JavaScript detections) will show up as an inline `script-src` violation. Turn that feature off rather than adding `'unsafe-inline'`, which would undo the policy.
4. When the console is quiet, edit the rule and rename the header to `Content-Security-Policy`.

## Deploy order

Deploy the server before the web build: the series schema gained `coverUrl`, and a new web build against an old server would not get it.

## Rate limiting

Caddy sets `X-Forwarded-For` to Cloudflare's `CF-Connecting-IP` header (the visitor's IP) on both proxies, so the server sees one proxy (Caddy at 127.0.0.1) and one forwarded address. Set `TRUST_PROXY=1` (see `parseTrustProxy`). With `2`, or with no `header_up` line, the limit would be keyed on the wrong address.

Anyone who learns the Droplet's IP could skip Cloudflare and send a fake `CF-Connecting-IP` to dodge the limit. Close that with a DigitalOcean Cloud Firewall that allows inbound 80 and 443 only from Cloudflare's ranges (https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6), plus SSH from your own IP.

Also set `HOST=127.0.0.1` in the server's `.env` on the Droplet, so the API can't be reached on port 3001 even without the firewall. Caddy still reaches it.

To check: request an `/api/...` endpoint (not `/health`, which has no limit) from two different networks and confirm each gets its own `x-ratelimit-remaining` count.

## Check it

Cloudflare challenges a plain `curl` even with a crawler User-Agent, so test the origin from the Droplet itself:

```
curl -s -A Twitterbot --resolve shelfthread.com:443:127.0.0.1 https://shelfthread.com/work/OL59798W | grep og:image
```

Then try the X and Facebook card validators, which go through Cloudflare like real previews.

For the JSON-LD, check that search crawlers get it too, then paste a page URL into Google's Rich Results Test (search.google.com/test/rich-results). Expect "No items detected" for rich results: Book, Person and CollectionPage don't earn rich snippets. Check that the parsed structured data lists the page's item:

```
curl -s -A Googlebot --resolve shelfthread.com:443:127.0.0.1 https://shelfthread.com/author/OL26320A | grep ld+json
```

## Search crawlers and load

Search crawlers fetch many more pages than link-preview bots, and each page they request now goes through `/og`. Three effects to watch:

- `/og` shares the API's per-IP rate limit (100 requests a minute). A busy Googlebot or Bingbot address can get 429s on page HTML; Search Console's crawl stats show these. Exempting `/og` isn't safe on its own, since anyone could fake a crawler User-Agent to skip the limit.
- An uncached page triggers upstream lookups (Hardcover, Google Books, Wikidata) that count against their quotas.
- If `WEB_INDEX_HTML` is unreadable, crawlers get a 500 for every page instead of the static file.
