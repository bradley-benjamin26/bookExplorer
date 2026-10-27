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
@preview header_regexp ua User-Agent (?i)(twitterbot|facebookexternalhit|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|redditbot|bluesky|mastodon|embedly|pinterest|skypeuripreview|iframely)
handle @preview {
  rewrite * /og{uri}
  reverse_proxy 127.0.0.1:3001
}
```

Only crawlers hit the server.

## Cloudflare

Today the site answers non-browser requests with a challenge (403, `cf-mitigated: challenge`), which also blocks these crawlers. Add a WAF custom rule with action "Skip" for `(cf.client.bot)` on shelfthread.com, or allow verified bots under Security > Bots.

## Check it

```
curl -A Twitterbot https://shelfthread.com/work/OL59798W | grep og:image
```

Then try the X and Facebook card validators.
