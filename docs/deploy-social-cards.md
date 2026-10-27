# Deploying link-preview cards

Shared links (`/work/...`, `/book/...`, `/author/...`, `/subject/...`, `/graph/...`) show a title, description and image in chat and social apps. The static site can't do that per page, so the API server renders the tags for crawlers only. People's page loads stay static and fast.

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
        header_regexp ua User-Agent (?i)(twitterbot|facebookexternalhit|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|redditbot|bluesky|mastodon|embedly|pinterest|skypeuripreview|iframely)
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

1. Find what issues it: Security > Events, filter on a challenged request, and read the "Service" column (managed rules, Bot Fight Mode, Browser Integrity Check, security level…).
2. Add a WAF custom rule for shelfthread.com: expression `(cf.client.bot)` ("Known Bots" in the rule builder), action **Skip**, and tick every component the events showed.
3. If the service is **Bot Fight Mode** on the Free plan, a Skip rule can't bypass it; turn it off under Security > Bots, or previews stay blocked.

To confirm crawlers get through: paste a page URL into Facebook's Sharing Debugger (developers.facebook.com/tools/debug) and opengraph.xyz, then open Security > Events and look for challenged requests from those fetches. If they were challenged, add the rule from step 2 above, and for Bot Fight Mode see step 3. Verified bots only: the rule can't be spoofed with a User-Agent. Skip both Managed Challenge and Bot Fight Mode when `cf.client.bot` is true.

Discord, Telegram, WhatsApp and Mastodon fetchers aren't all Cloudflare "known bots". If their previews fail while X and Facebook work, add their User-Agents to the Skip rule's expression, e.g. `(cf.client.bot or http.user_agent contains "Discordbot" or http.user_agent contains "TelegramBot")`. User-Agents can be faked, so this lets anyone using those strings past the challenge; they still only reach static pages and `/og`.

## Deploy order

Deploy the server before the web build: the series schema gained `coverUrl`, and a new web build against an old server would not get it.

## Rate limiting

Caddy sets `X-Forwarded-For` to Cloudflare's `CF-Connecting-IP` header (the visitor's IP) on both proxies, so the server sees one proxy (Caddy at 127.0.0.1) and one forwarded address. Set `TRUST_PROXY=1` (see `parseTrustProxy`). With `2`, or with no `header_up` line, the limit would be keyed on the wrong address.

Anyone who learns the Droplet's IP could skip Cloudflare and send a fake `CF-Connecting-IP` to dodge the limit. Close that with a DigitalOcean Cloud Firewall that allows inbound 80 and 443 only from Cloudflare's ranges (https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6), plus SSH from your own IP.

To check: request an `/api/...` endpoint (not `/health`, which has no limit) from two different networks and confirm each gets its own `x-ratelimit-remaining` count.

## Check it

Cloudflare challenges a plain `curl` even with a crawler User-Agent, so test the origin from the Droplet itself:

```
curl -s -A Twitterbot --resolve shelfthread.com:443:127.0.0.1 https://shelfthread.com/work/OL59798W | grep og:image
```

Then try the X and Facebook card validators, which go through Cloudflare like real previews.
