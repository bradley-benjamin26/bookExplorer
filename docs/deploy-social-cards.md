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

In the shelfthread.com site block:

```
@preview {
  header_regexp ua User-Agent (?i)(twitterbot|facebookexternalhit|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|redditbot|bluesky|mastodon|embedly|pinterest|skypeuripreview|iframely)
  path / /work/* /book/* /author/* /subject/* /graph/*
}
handle @preview {
  rewrite * /og{uri}
  reverse_proxy 127.0.0.1:3001
}
```

Only crawlers hit the server. The matcher lists page paths on purpose (both conditions must hold): crawlers fetch `og:image` with their own User-Agent, so without the `path` line `/og-image.png` would be rewritten to an HTML page, and a CDN might cache that HTML at the image URL.

## Cloudflare

Today the site answers non-browser requests with a challenge (403, `cf-mitigated: challenge`), which also blocks these crawlers. Add a WAF custom rule with action "Skip" for `(cf.client.bot)` on shelfthread.com, or allow verified bots under Security > Bots. Discord, Telegram, WhatsApp and Mastodon fetchers aren't all Cloudflare verified bots, and Bot Fight Mode on the Free plan may not be skippable by a WAF rule; if those previews fail, check the challenge source.

## Deploy order and rate limiting

Deploy the server before the web build: the series schema gained `coverUrl`, and a new web build against an old server would not get it.

The server's per-IP rate limit sees the client's real IP only if Caddy passes Cloudflare's `X-Forwarded-For` through. By default Caddy doesn't: it replaces the header with its own peer, which is a Cloudflare edge IP, so every visitor behind the same edge would share one limit. Tell Caddy to trust Cloudflare, in the global options block so it covers api.shelfthread.com too:

```
{
  servers {
    trusted_proxies static <Cloudflare ranges from https://www.cloudflare.com/ips-v4 and /ips-v6>
  }
}
```

Then the server sees `X-Forwarded-For: <client>, <cloudflare edge>` from Caddy at 127.0.0.1, and `TRUST_PROXY=2` (trust Caddy and Cloudflare; see `parseTrustProxy`) picks out the client. A request that skips Cloudflare and hits the origin directly isn't from a trusted range, so Caddy overwrites its header and it can't spoof an IP. Keep the ranges current; the `caddy-cloudflare-ip` module (`trusted_proxies cloudflare`) does this automatically.

To check: request the API from two different networks and confirm each gets its own `x-ratelimit-remaining` count.

## Check it

```
curl -A Twitterbot https://shelfthread.com/work/OL59798W | grep og:image
```

Then try the X and Facebook card validators.
