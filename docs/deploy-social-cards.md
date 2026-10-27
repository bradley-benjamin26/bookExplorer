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

The server's per-IP rate limit sees the client's real IP only if `TRUST_PROXY` matches the proxy chain. Behind Cloudflare and Caddy that is two hops, so set `TRUST_PROXY=2` (see `parseTrustProxy`: a number trusts that many hops). Unset, every request appears to come from Caddy and shares one limit; `true` trusts only one hop.

## Check it

```
curl -A Twitterbot https://shelfthread.com/work/OL59798W | grep og:image
```

Then try the X and Facebook card validators.
