# App Store submission plan: Shelf Thread

Written for: the developer submitting the first iOS build of Shelf Thread, working through App Store Connect and EAS for the first time.

Items marked **Verify** are facts this repo cannot settle. Check them in the Apple or Expo dashboards before you submit.

## 1. What the repo already gives you

| Item | Value | Source |
|---|---|---|
| Display name | Shelf Thread | `apps/app/app.json` `expo.name` |
| Bundle ID | `com.bbradle1.bookexplorer` | `apps/app/app.json` `ios.bundleIdentifier` |
| Version | 1.0.0 | `apps/app/app.json` `expo.version` |
| Build number | Auto-incremented by EAS on the `production` profile | `apps/app/eas.json` `build.production.autoIncrement` |
| iOS app icon | `apps/app/assets/icon.png` is Expo's blank template icon (a blue chevron with guide circles), not your design. Replace it before submitting for review. Layered artwork for Icon Composer is in `apps/app/assets/icon-composer/`: 1024×1024 PNG layers with transparency in `png/` (`background.png`, `spool.png`, `thread.png`, `nodes.png`) and the same layers as SVG (Icon Composer rejected the SVGs, so use the PNGs). `preview.svg` and `png/preview.png` are stacked previews only. The finished Icon Composer file is `apps/app/assets/icon-composer/button.icon`, and `ios.icon` in `app.json` points at it, so the next build uses it on iOS. Build 2 shipped with the template icon. The top-level `icon` (`assets/icon.png`) is still the template; it only affects web and Expo Go. **Verify** in the build log that the icon is picked up (it needs a recent Xcode on the EAS build image). | `apps/app/assets/icon.png`, `apps/app/assets/icon-composer/` |
| Camera permission text | "Shelf Thread uses the camera to scan book barcodes." | `apps/app/app.json` `NSCameraUsageDescription` |
| Orientation | Portrait | `apps/app/app.json` |
| Tablet support | Yes (`supportsTablet: true`) | `apps/app/app.json` |
| Privacy policy | Written, at `apps/app/public/privacy.html`, last updated November 14, 2026 | Served from the website, see §3 |

## 2. Before the first build

1. **Commit the working-tree changes.** `apps/app/public/privacy.html` has uncommitted edits, and `apps/app/public/fonts/` is untracked. The policy must be the version that ships on the website.
2. **Verify the Expo owner.** `apps/app/app.json` sets `"owner": "engomia"`, and the EAS project ID is `90a4fb20-31a2-43e3-b63a-2afa3224cbc8`. Make sure the Expo account that owns this project is the one that will submit the build. **Verify**
3. **Export compliance.** `apps/app/app.json` now sets `ios.config.usesNonExemptEncryption: false`. Expo writes this as `ITSAppUsesNonExemptEncryption` in Info.plist. The app uses only HTTPS and the iOS Keychain (via `expo-secure-store`), which fall under the standard-encryption exemption. The AES-256-GCM encryption of Hardcover and Open Library tokens happens on the server, not in the app. **Verify** that the exemption applies to your case.
4. **Privacy manifest.** `apps/app/app.json` now sets `ios.privacyManifests`, and Expo writes it to `PrivacyInfo.xcprivacy` at build time. The data types match §4 and the three required-reason APIs (UserDefaults, file timestamps, system boot time) come from the earlier manifest. Check that the reasons still fit the code, and check the built app's manifest with Xcode's privacy report before you submit. **Verify**
   - The data type identifiers are Apple's standard names. Confirm them against Apple's privacy manifest documentation. **Verify**
   - The camera plugin adds a microphone permission message on iOS and `RECORD_AUDIO` on Android by default, and the app never records audio. `app.json` now sets `microphonePermission: false` and `recordAudioAndroid: false` on `expo-camera`, and the duplicated manifest entries and Android permissions that appeared after the first EAS build were removed. A build made before this change (build 2) may still carry the microphone message, so rebuild before you submit for review. **Verify**
   - Server IP-address logs are not in the manifest. Add them only if you decide they count as collected data (§4). **Verify**
   - The old root-level `ios/` folder was deleted and regenerated as `apps/app/ios/` (gitignored), with the current bundle ID and privacy manifest. Its Xcode project is now named `ShelfThread`. `pod install` needs a UTF-8 locale (`LANG=en_US.UTF-8`) to run.
   - Leftovers from an earlier root-level prebuild (a root `app.json` with the old `com.engomia` bundle ID, a root `android/` folder, and edits to the root `package.json` and `package-lock.json`) were removed. The root package files are back to their committed versions.
5. **Confirm the policy URL is live.** The policy needs to load at `https://shelfthread.com/privacy.html` before you enter it in App Store Connect. **Verify**
6. **Confirm the server is up.** Apple's reviewer will search for books, so the production server must answer when they test it.
7. **Give the production build its server URL.** `apps/app/src/api/client.ts` throws in a production build unless `EXPO_PUBLIC_API_BASE_URL` is set, and it sends `EXPO_PUBLIC_APP_SHARED_SECRET` as `X-App-Key` when set. Today `EXPO_PUBLIC_API_BASE_URL` exists only in `apps/app/.env`, which is gitignored, so EAS will not see it. Add these as EAS environment variables (or an `env` block in the `production` profile of `eas.json` for non-secret values) before you build. The production value is `https://api.shelfthread.com` (the static site is at shelfthread.com; the API is only on the `api` host), with no trailing slash. A request without an `X-App-Key` header succeeded on 2026-11-19, so `APP_SHARED_SECRET` appears to be unset on the production server and the app does not need `EXPO_PUBLIC_APP_SHARED_SECRET`. If you turn the secret on later, set the matching value in the same EAS environment. **Verify**

## 3. App Store Connect setup

### App information
- **Name:** Shelf Thread. Check that the name is free on the App Store. The store requires unique names. **Verify**
- **Subtitle:** A short line such as "Explore how books connect" (30 characters max).
- **Bundle ID:** `com.bbradle1.bookexplorer`. Register it under Certificates, Identifiers & Profiles, or let EAS create it.
- **Primary category:** Reference or Books. Secondary category: optional.
- **Age rating:** Answer for the content a user can see in search results, including titles, descriptions, and covers from outside catalogs, not only the app's own screens. An earlier version of this plan said to answer "Infrequent/Mild" for every violence and sexual content question, and App Store Connect then returned "this app can't be made available on the App Store" ("Based on your selections"). Set the most severe categories (prolonged graphic or sadistic violence, and any graphic sexual content or nudity question) to None. Use "Infrequent/Mild" only for the milder ones: horror, mature themes, profanity, cartoon or fantasy violence, realistic violence, weapons, and the less severe sexual content question. Result: with graphic sexual content and nudity and prolonged graphic or sadistic realistic violence set to None, the questionnaire returned 13+ and no longer blocked the app. App Review can still object to what search surfaces, so mention in the review notes that results come from public book catalogs, and keep a maturity filter as the fallback if Apple raises it. Answer No to user-generated content and unrestricted web access. Use the rating the questionnaire returns. **Verify** each answer.
- **Privacy policy URL:** `https://shelfthread.com/privacy.html`
- **Support URL:** Must be a live page with contact details. The policy lists `support@shelfthread.com`. **Verify** that the mailbox exists.
- **Marketing URL:** Optional, `https://shelfthread.com`.

### Pricing and availability
- Price: Free (the app has no in-app purchases or subscriptions).
- Territories: Start with all, or limit to the United States for the first release.

### Screenshots
- Required sizes: 6.9" iPhone (1320×2868 or 1290×2796) and, if you keep iPad support, 13" iPad. The 6.9" set covers the smaller sizes.
- Capture: search results, a book page, the Graph view, a saved list, and the barcode scanner.
- Include a screenshot of the Graph view so the reviewer sees the core feature.
- If the Xcode simulator is too heavy for your Mac, build with EAS, install the build on your own iPhone through TestFlight, and take the screenshots there. The pixel size must match what App Store Connect asks for, and if you have no iPad, set `supportsTablet` to `false` before building so you only need iPhone screenshots.

### Description and keywords
- Describe what the app does: searching books, exploring connections among books, authors and subjects, checking library availability, and optional sync with Hardcover and Open Library.
- Keywords (100 characters max, comma-separated with no spaces): `recommendations,reading,lists,library,catalog,barcode,scanner,isbn,authors,similar,graph,discover` (97 characters). Words already in the app name or subtitle ("shelf", "thread", "explore", "books", "connect") are indexed anyway, so don't repeat them. Singular and plural forms count as one.
- Do not use other companies' names (Hardcover, Open Library, Goodreads) as keywords. Apple's rules bar trademarked terms and other apps' names in metadata. Naming Hardcover and Open Library in the description, to say what the app connects to, is fine.

## 4. App Privacy ("nutrition label")

Answer from what the app actually sends. The privacy policy at `apps/app/public/privacy.html` is the reference. **Verify** each answer against the code before you submit.

**Tracking:** No. The app does not track users across other companies' apps or websites, and it does not use the advertising identifier.

**Data collected** (apply "Data Linked to You" only where a user identity is attached; the app has no accounts, so most data falls under "Data Not Linked to You"):

| Data type | Collected? | Linked to you? | Purpose | Basis in repo |
|---|---|---|---|---|
| Search History | Yes | No | App Functionality, Analytics (not Product Personalization: recommendations are computed on the device) | Search terms are sent to the server (`apps/server/src/routes/searchRoutes`) and the policy says popular searches are counted |
| Identifiers: User ID | Yes, only for connected accounts | Yes | App Functionality | Hardcover user ID and username, Open Library username (`apps/app/src/api/client.ts`, `sessionStore.ts`) |
| Other Data: Access tokens / keys | Yes, only for connected accounts | Yes | App Functionality | Hardcover tokens and Open Library keys stored on the server |
| Diagnostics / Usage | Server logs only | No | App Functionality, Analytics | Server request logs with IP addresses, kept 30 days |
| Contact Info, Location, Contacts, Photos, Health, Financial, Sensitive Info | No | — | — | None found in the code |
| User Content | Only if the user sends feedback | No | App Functionality | Feedback goes to a Google Form, not to the app (`FEEDBACK_FORM_URL`) |

Notes for the answers:
- **Server logs** record IP addresses. Apple's categories for this are Identifiers or Diagnostics, depending on how you read "collected". Pick one, keep it consistent with the policy, and check the Apple guidance when you fill it in. **Verify**
- **Feedback** goes through Google Forms, which is a third-party service. Apple asks about data the app collects, so a link to a form may not count, but the policy discloses it. **Verify**
- **Camera:** barcode frames are processed on the device and are not stored. Apple does not treat this as collected data.
- **Local storage** (saved books, lists, history, preferences) stays on the device and is not collected. Do not declare it.

## 5. Accessibility nutrition labels

Apple's Accessibility Nutrition Labels describe which accessibility features the app supports. Declare only what you have tested on a device. The labels are set per device type, and the app has `supportsTablet: true`, so test and declare iPhone and iPad separately (the iOS simulator can run an iPad profile). If you don't want to test iPad for the first release, set `supportsTablet` to `false`. **Verify** the per-device selection in App Store Connect. Use the existing WCAG 2.2 AA work as a starting point.

Features to test and declare:

| Feature | What to test | Repo support |
|---|---|---|
| VoiceOver | Walk through search, book, graph list, saved, and scan screens | Button roles, labels, and a Graph List view (the non-visual alternative) per `docs/superpowers/plans/2026-10-21-feature-roadmap.md` |
| Voice Control | Say the visible label of each button and link | Labels follow the visible text |
| Larger Text (Dynamic Type) | Set the largest text size and check for clipping | **Verify** |
| Sufficient Contrast | Check text and input borders in light and dark themes | Contrast tokens tuned 2026-10-26 |
| Dark Interface | Confirm the dark theme | `userInterfaceStyle: automatic` and theme tokens |
| Differentiate Without Color | Check that status (available, checked out, selected) is not shown by color alone | **Verify** |
| Reduced Motion | Check the graph animation with Reduce Motion on | **Verify** |
| Captions / Audio Descriptions | The app has no audio or video | Not applicable |

An accessibility statement page is at `apps/app/public/accessibility.html` (to be served at `https://shelfthread.com/accessibility.html`) and is linked from the app footer. It states only what a code review and contrast measurements support, and it says plainly that there is no independent audit and no VPAT. App Store Connect may offer an optional field for an accessibility information URL; if it does, use that URL. **Verify** Update the page's "How we checked" section and its date after you test on devices, and keep it consistent with the labels you declare.

The worktree copy of `accessibilityFixPlan.txt` (under `.claude/worktrees/ux-refresh-a/`) describes the phases of the WCAG 2.2 AA work. Copy it into `docs/` if you want it in the repo. Note that the roadmap refers to it at the repo root, but it is not there.

## 6. Review risks

- **Account deletion (Guideline 5.1.1(v)).** The app has no accounts of its own. Connected Hardcover and Open Library accounts can be disconnected in Settings, and "Delete all data" removes local data. Mention this in the review notes.
- **Third-party sign-in (Guideline 4.8).** Hardcover and Open Library sign-in is optional and not used to create the app account, so Sign in with Apple should not be required. If the reviewer disagrees, the response is that connection is optional. **Verify** before you submit.
- **Camera (Guideline 5.1.1).** Write in the review notes that the camera is only for barcode scanning, that typing an ISBN is an alternative, and that no images are saved.
- **Reviewer access.** The app works without an account, so no demo login is needed. Say so in the notes.
- **External links.** Bookshop.org, WorldCat, and library sites open in the browser through `expo-web-browser`. Mention this in the notes.
- **Server dependency.** Search needs the production server. Describe this in the review notes and keep the server up during review.

Suggested review notes text:

> Shelf Thread needs no account. Search works immediately. Connecting Hardcover or Open Library is optional and is in Settings. Camera access is used only to read book barcodes; typing an ISBN also works. Data stays on the device except for search requests to our server. Book titles, descriptions, and covers come from public book catalogs (Open Library, Google Books, and Hardcover); the app does not host or add content, and users cannot post content to other users. The privacy policy is at https://shelfthread.com/privacy.html.

## 7. Build and submit

```sh
cd apps/app
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

After the build finishes:
1. In App Store Connect, open the uploaded build under the app's version and attach it.
2. Fill in the App Privacy and Accessibility sections (§4 and §5).
3. Add screenshots, description, and review notes (§3 and §6).
4. Submit for review.

The `submit.production` block in `eas.json` is empty. Fill in your Apple ID, App Store Connect app ID, and team ID there, or enter them when EAS prompts. **Verify**

## 8. Checklist

- [ ] Commit `privacy.html` and `fonts/`
- [ ] Confirm the Expo owner and project
- [x] Set `ios.config.usesNonExemptEncryption: false` in `app.json` (done)
- [x] Add `ios.privacyManifests` to `app.json` (done)
- [ ] Verify the export-compliance exemption and the privacy manifest identifiers (§2 items 3–4)
- [ ] Check the built app's `PrivacyInfo.xcprivacy` in Xcode's privacy report
- [x] Replace the stale root `ios/` folder with `apps/app/ios/` (done; regenerated and `pod install` run)
- [x] Remove the root-level leftovers (`app.json`, `android/`, root `package.json` and `package-lock.json` edits) (done)
- [ ] Confirm `https://shelfthread.com/privacy.html` and the support mailbox are live
- [ ] Confirm the production server is up
- [ ] Set `EXPO_PUBLIC_API_BASE_URL=https://api.shelfthread.com` as a production EAS environment variable (the shared secret only if you enable it on the server)
- [ ] Reserve the app name
- [ ] Complete the age rating questionnaire
- [ ] Capture screenshots, including the Graph view
- [ ] Complete App Privacy from §4 and check each answer against the code
- [ ] Deploy `accessibility.html` so `https://shelfthread.com/accessibility.html` loads (the footer links to it)
- [ ] Test each accessibility feature in §5 and declare only what passes
- [ ] Write the review notes from §6
- [ ] Build and submit with EAS (§7)
