# Book Explorer

Scan a book's barcode (or type its ISBN) and explore a linked-data map of it: its
authors, those authors' influences and relationships, related subjects, and other
books that share those subjects. One codebase, via Expo/React Native, runs on iOS,
Android, and web.

See [docs/CODEBASE.md](docs/CODEBASE.md) for a file-by-file guide and
[docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) for a review of the code with bugs found
and fixed.

## Requirements

- Node.js 20+ (tested on Node 26)
- npm (this repo uses npm workspaces — no other package manager is needed)
- For running on a phone: the [Expo Go](https://expo.dev/go) app, or Xcode/Android
  Studio for a simulator/emulator

## Setup

From the repo root:

```
npm install
```

This installs dependencies for every workspace (`apps/app`, `apps/server`,
`packages/shared`).

## Running it

You need **two terminals**: one for the backend server, one for the app. The app
talks to the server, so start the server first.

**Terminal 1 — backend server** (aggregates Open Library, Google Books, and
Wikidata, and caches the results):

```
npm run dev:server
```

Starts a Fastify server on `http://localhost:3001` (override with a `PORT` env
var). Confirm it's up:

```
curl http://localhost:3001/health
```

Optionally, set `GOOGLE_BOOKS_API_KEY` to a [Google Books API
key](https://console.cloud.google.com/apis/library/books.googleapis.com) so book
descriptions/covers use your own request quota instead of the small pool shared by
every unauthenticated caller (which is easy to exhaust — you'll see book
descriptions silently fall back to Open Library's, often much thinner, text
without it):

```
GOOGLE_BOOKS_API_KEY=your-key-here npm run dev:server
```

To avoid retyping it, put it in `apps/server/.env` instead (copy
`apps/server/.env.example` to `apps/server/.env` and fill it in) — the dev server
loads that file automatically if it exists, and `.env` is gitignored so it won't
get committed.

**Terminal 2 — the app:**

```
npm run dev:app
```

This opens the Expo CLI. From there:

- Press `w` to open the **web** version in your browser.
- Press `i` to open in an **iOS simulator** (requires Xcode, macOS only).
- Press `a` to open in an **Android emulator** (requires Android Studio).
- Or scan the printed QR code with the **Expo Go** app on your phone (phone and
  computer must be on the same Wi-Fi network).

You can also jump straight to one target with `npm run --workspace=apps/app web`,
`...ios`, or `...android`.

### A note on the phone/simulator case

The app points at `http://localhost:3001` when running in a browser. When running
on a physical device or simulator, it instead auto-detects the LAN IP that Expo's
own dev server (Metro) is running on and talks to the backend at that same address
on port 3001 — so as long as your phone/simulator and computer are on the same
network, and the backend from Terminal 1 is running, no manual configuration is
needed.

### Testing on a phone when the normal Wi-Fi connection doesn't work

Sometimes Expo Go fails to connect even though your phone and computer are
genuinely on the same Wi-Fi — usually with an error like "network connection
was lost." A few things can cause that, roughly in order of how often they
turn out to be the culprit:

1. **macOS's Local Network permission.** System Settings → Privacy & Security
   → Local Network — make sure Terminal (or whichever app you launched
   `npm run dev:app` from) is allowed. If it's missing from the list, restart
   the dev server and check again; that's usually what makes macOS add it.
2. **macOS Firewall.** System Settings → Network → Firewall → Options — check
   that Node is allowed to accept incoming connections.
3. **Router/mesh Wi-Fi client isolation.** Some routers isolate wireless
   clients from each other even without an explicit "guest network" — check
   your phone and computer are on the *exact* same network name, not a
   similar-looking 2.4GHz/5GHz variant.

To test whether it's a network issue at all: open
`http://<your-computer's-LAN-IP>:3001/health` directly in your phone's
browser (find your IP via System Settings → Wi-Fi → the network's info
button, or `ipconfig getifaddr en0` in Terminal). If that doesn't load
either, it confirms the problem is network-level, not Expo- or app-specific.

**If you don't control the Mac's firewall/network settings** (a managed
work/school machine, for example), or the above doesn't fix it, route around
the LAN entirely with a tunnel:

1. Start the backend server as usual (`npm run dev:server`).
2. In a third terminal, tunnel port 3001 out to a public URL:
   ```
   npx localtunnel --port 3001
   ```
   This prints a URL like `https://short-words-12.loca.lt`. Open
   `<that-url>/health` in your phone's browser first — loca.lt shows a
   one-time "click to continue" interstitial page the first time, which you
   need to get past before the app can use it. You should see
   `{"status":"ok"}` once you're through.
   - (`npx ngrok http 3001` is the more common alternative, but on some
     managed Macs the downloaded ngrok binary gets silently killed by
     endpoint security software the moment it runs — if `npx ngrok ...`
     just prints "killed" with no other output, that's what's happening, and
     `localtunnel` is worth trying instead since it's pure JavaScript with no
     downloaded binary.)
3. Start the app **from `apps/app`, not the repo root** (running `expo start`
   from the repo root fails with `Unable to resolve module ../../App`, since
   the actual Expo project — and its Expo Router entry point — lives in
   `apps/app`), pointing it at that tunnel URL instead of auto-detecting your
   LAN IP:
   ```
   cd apps/app
   EXPO_PUBLIC_API_BASE_URL=https://short-words-12.loca.lt npx expo start --tunnel
   ```
   (use your actual tunnel URL, no `/health` suffix, no trailing slash).
   `--tunnel` here does the same thing for Metro's JS bundle that
   `localtunnel`/`ngrok` just did for the backend — both are needed since
   they're separate connections.
4. Reload the app on your phone (shake for the dev menu → Reload, or rescan
   the QR code).

Both the localtunnel URL and a free ngrok URL change every time you restart
the tunnel, so this whole sequence needs repeating each session. If a
request starts failing partway through testing, it's often the loca.lt
interstitial again — reopen the tunnel URL in your phone's browser, click
through it, and retry.

## Trying it out

- On the Home screen, either tap **Scan** to use your camera on a book's barcode,
  or type an ISBN directly and submit it.
- A known-good ISBN to try: `9780141439518` (Pride and Prejudice).
- From a book's detail screen, drill into its authors, subjects, and related
  works, or tap **View as Graph** for the interactive force-directed graph
  explorer.

Barcode scanning uses the native camera on iOS/Android; on web it falls back to a
JS-based scanner reading your webcam. A manual ISBN entry field is always
available as a fallback everywhere.

## Project layout

```
bookExplorer/
  apps/
    app/          Expo app (iOS + Android + web)
    server/       Fastify backend that aggregates/caches external APIs
  packages/
    shared/       Shared TypeScript types + zod schemas used by both
```

## Troubleshooting

- **"Network request failed" / book lookups don't return anything**: make sure the
  backend server (Terminal 1) is actually running — it doesn't stay up on its own
  between sessions.
- **Web camera scanning doesn't work**: some browsers require HTTPS or explicit
  camera permission for `getUserMedia`; the manual ISBN field always works as a
  fallback.
- **Metro/bundler can't resolve `@book-explorer/shared`**: run `npm install` again
  from the repo root so the workspace symlinks are set up correctly.
- **Expo Go says "network connection was lost" even on the same Wi-Fi**, or
  **`Unable to resolve module ../../App`**: see
  [Testing on a phone when the normal Wi-Fi connection doesn't work](#testing-on-a-phone-when-the-normal-wi-fi-connection-doesnt-work)
  above.
