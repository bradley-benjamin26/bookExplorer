# P9 — Henry, 57, used-book dealer

## Review basis

I buy 200–500 books in a lot. I need to identify the copy in my hand, record it, and move on. Seconds per book matter more than finding another novel.

**Actually interacted with the running web UI:** started the existing Expo web app on port 8099 and backend on port 3001; verified both responded. Searched for *The Hobbit*, opened its work and a specific edition, created a list, saved an edition and another work, added a subject and note, reloaded to verify those edits, explored graph nodes, opened a subject page, viewed list-filtered recommendations, and searched by author and opened Tolkien's page. Compared that author page at 1280×900 and 390×844, including screenshots.

**Source-only assessment:** camera/batch scanning, duplicate handling, sound/haptics, offline recovery, CSV contents, and Bluetooth scanner behavior. No physical Android device, barcode scanner, 200–500-book run, network-loss test, or export download was tested. I did not measure throughput. This is one independent persona review, not a usability session with a real dealer.

The current working tree includes pre-existing untracked files. I left them alone. At `/`, the preview unexpectedly showed “connection (1)” and “Connect this item to…”, including after clicking the Shelf Thread link. Direct navigation to `/search?q=The%20Hobbit` worked. An untracked `apps/app/app/connection (1).tsx` exists; I have not established the cause or whether a clean checkout behaves the same.

## 1) Initial impressions; mobile or desktop?

“Nice enough. Where's my intake station?”

The pages I inspected are readable, with obvious primary buttons. The desktop view is a centered, phone-like column rather than an inventory table. On the narrow web view, the author biography and graph/connection buttons take up space before the works list. That's room I would rather spend on edition facts.

For buying a lot, **mobile wins because the books are in my other hand**, not because I verified native scanning. Desktop would be my preference for checking and exporting a finished intake, but the inspected layout does not exploit its width for that job. The root-page anomaly was a bad first impression; I needed a direct search URL to proceed.

## 2) Find an interesting book and describe its page

Yes. I searched for *The Hobbit*, a plausible stock-identification example, and opened Tolkien's result. The work page showed a description, ratings, related books, subjects, and “Find Your Edition (49).”

Publisher, date, and sometimes format on the edition cards are useful. Forty-nine horizontally arranged choices, some with “No cover” and generic “Edition” labels, are not a quick identification workflow. One card displayed “Paperback / The Random House Publishing Group / 1937.” I am not treating that catalog date as proof of a first printing.

I opened a HarperCollins Publishers 2024 card. It led to **Hobbit Deluxe Illustrated Edition**, ISBN `9780063417069` in the URL. The rendered page did not show publisher, publication year, or an explicit ISBN field; this particular record did not show format either. The source renders format when supplied, but the book-detail page does not provide a publisher/date/printing facts panel.

That's the wrong trade-off for me. Ratings and fantasy subjects do not tell me which copy to list. The Open Library and WorldCat links are useful escape routes, but I did not follow them or verify external edition details.

## 2a) Work versus edition

I understand the distinction already. *The Hobbit* is the work; the illustrated HarperCollins copy is an edition. Clicking an edition changed the route from `/work/OL27482W` to `/book/9780063417069` and changed the title, so that part made sense.

The terminology could be sharper: the screen headers say “Work” and “Book,” while graph work nodes are labeled “Book.” When I saved *Farmer Giles of Ham*, I was offered “Choose an edition” or “Save the work instead.” That is a useful safeguard, and I deliberately saved the work for this test—not a verified physical copy.

I need the edition page to keep its identifying facts visible. For older stock, the source explicitly makes edition cards without an ISBN non-clickable. I can save the general work, but that is not a substitute for cataloguing my particular non-ISBN edition.

## 2b) Add terms and notes

Done, and checked after reload. Clicking the edit-lock icon first required saving to a list. I created **Henry estate-sale review**, saved the illustrated Hobbit edition, added the subject **Estate sale October**, and entered **“Check jacket and printing before listing.”** After locking and reloading, the note remained; expanding subjects showed the added term.

Useful: local annotations actually survived that ordinary reload. Annoying: unlocking expanded a very long subject inventory before the notes field. I want a condition/printing note close to the edition facts, not buried below dozens of catalog terms.

Source confirms terms save on relocking or leaving the page; notes use delayed autosave and flush on blur/unmount. That is not proof against an abrupt device shutdown.

## 3) Graph view and node exploration

I clicked “View as Graph,” then Tolkien, back through *The Hobbit*, then Fantasy, and activated the centered Fantasy node to open its page. The graph explained its interaction: tap a circle to move there, tap the center to open its page. I saw List, Filter, and zoom controls, but did not exercise those controls.

“It works for wandering. I'm not wandering.”

The relationships were understandable, but recentering before opening a page adds interaction I do not need during intake. The edition's graph took me into a **work** graph, not an edition-identification view. Keep it available for customers; don't make it my route to the facts.

## 3a) Subject page

I opened Fantasy from the centered graph node. It showed **14,840 works**, broader/narrower topics, book rows, and Most read/Top rated/Newest/Classic sorting controls. I did not test changing the sort.

Useful for browsing stock categories, not deciding whether this copy is worth listing. The same page showed broader topics including **Defense Mechanisms (Psychology)** and narrower **Sexual Fantasies**, alongside fantasy-literature books. That feels like a different sense of “fantasy” leaking into the shelf category. I verified those labels, not the upstream cause.

## 4) Lists and recommendations

I saved the illustrated Hobbit edition and the *Farmer Giles of Ham* work to **Henry estate-sale review**. The list initially showed the saved edition and offered Export CSV/Export JSON. I later filtered Recommendations to that list.

With the Hobbit alone, “More by J.R.R. Tolkien” included *Beren and Lúthien* and *Farmer Giles of Ham*; I opened the latter. After the second save, I saw a “Because you like Children's fiction (2 saved)” group with Harry Potter titles and explicit “shares” explanations.

Those are plausible reading connections. They are **not buying recommendations**: I saw no evidence there about the edition, condition, resale demand, or listing value. “Good books, perhaps. Not an answer to whether I buy this box.” I did not verify profitability or download a CSV.

## 5) Author search and author page

Yes, but indirectly. I searched **Tolkien**, opened Filters, selected Author, then opened *The Hobbit* and clicked **J.R.R. Tolkien**. Author mode returned books by the author, not a direct list of author profiles.

The author page showed dates, a biography, a works list, graph/connection actions, and an Open Library link. Works are useful when I'm checking an unfamiliar title. The biography is less useful for intake. A direct author result would save a detour.

## 6) “Free Book Reader” as a name

“Sounds like something that opens ebooks. That's not the tool I just used.”

The running app calls itself **Shelf Thread**, as does the home-screen source. That's a better discovery name, but still does not advertise batch inventory. If this gets a serious dealer workflow, a clearly named **Stock Intake** mode matters more than another branding exercise.

## 7) Three favorite things

1. **Edition choice before saving a work.** Publisher/date cues and “Save the work instead” respect a distinction that matters.
2. **Saved notes and editable terms.** My test note and subject survived reload.
3. **Batch utility already has foundations in source:** checksum validation, duplicate detection, typed ISBN-10 conversion, per-row retry, and independent save outcomes. These are implemented paths, not a claim that I successfully scanned a lot.

## 8) Three least favorite things

1. **Edition facts fall away on the edition page.** I cannot verify publisher/year/printing from the main page I opened.
2. **Unfinished batch recovery is not durable in the inspected implementation.** Rows and duplicate tracking are component state. Only resolved books can be saved; failed lookups require Retry, and unresolved rows are explicitly skipped at finishing. The component's own Close warns about unsaved scans, but that is not a persisted session or recovery after a crash. I did not induce data loss.
3. **Capture feedback is not lookup confirmation, and I found no scan sound in the inspected scanner code.** Batch success haptics and “Added [ISBN]” happen before lookup completes. A later failure becomes “Not found” in the review list. In a noisy basement, I need distinct capture/identified/failed signals without constantly looking down.

## 9) New features that interest me

In priority order:

- **Durable intake sessions:** immediately store every accepted ISBN, preserve pending/failed rows across restart, retry on reconnection, and show a clear unresolved count. Existing saved-detail caching is useful, but it does not persist the live batch.
- **Fast, differentiated feedback:** audible success/error/duplicate signals plus vibration; distinguish “barcode captured” from “edition identified.” “Vibrate on scan” already defaults on; “Start in multi-book scanning” exists but defaults off. I would turn the latter on.
- **Dealer-grade identification:** publisher, publication date, format, ISBN-10/13, and carefully sourced printing/first-edition clues together. Unknown must mean unknown, not an optimistic first-edition badge.
- **Keyboard-scanner mode without camera dependency:** batch typed input handles submit, which suggests an Enter-suffixed Bluetooth scanner could work, but the scan screen requires camera permission before rendering batch mode. I did not test hardware focus or rapid repeated input. ISBN-10 ending in X also deserves a usable keyboard: the batch field requests a number pad.
- **Session CSV and older-book records:** a dedicated intake export with edition metadata and unresolved items, plus a way to identify a specific edition without an ISBN. Existing whole-library and per-list exports are real features, but `csv.ts` exports Goodreads-style title/author/ISBN/shelves/notes/date fields—not publisher, year, format, or unresolved scans. Batch's optional session label is a subject tag, and subjects are not in that CSV. A dedicated list can approximate session grouping, but that needs setup.

Also, duplicate ISBNs may be two physical copies, not a mistake. The source's “Already in this batch” behavior prevents another row for the same ISBN; I would want “same edition, quantity +1” as an explicit choice.

## 10) Overall opinion

“A discovery app with some useful intake parts. Not yet my weekend workhorse.”

Search, edition selection, annotations, lists, and navigation worked in the web paths I exercised. The source also shows meaningful batch work and persistent saved-detail caching. But saving only identified rows and keeping the active batch in memory are major mismatches for bad-signal buying. I cannot certify speed or reliability at my lot sizes from this review.

## 11) Ease of use and accessibility

Basic browsing was manageable; author search and the save-before-edit sequence took extra steps. The unexpected root screen was confusing. The narrow author layout remained readable, but required more vertical travel than desktop.

I did not use a screen reader, magnifier, or Android accessibility service and cannot report their performance. I used normal browser pointer/keyboard input. Accessible labels and graph-list support are visible in source, not a completed accessibility audit.

For my work, sound and haptics are functional access features: my eyes and hands are on books. Haptics default on in source, but I did not feel a vibration or hear verified scan feedback. No claim about native behavior or garage lighting is justified.

## 12) Would I use it again?

For a small, connected lookup or to keep notes, yes. For a 500-book lot in a church basement, not yet. I would reconsider after testing restart-safe batch sessions, reliable offline catch-up, edition facts, audible feedback, and a session export with my actual scanner. “Too slow—or loses the session? Next.”

## Assumptions

- *The Hobbit* and *Farmer Giles of Ham* were chosen as plausible stock examples; the persona does not specify Henry's reading preferences or actual inventory.
- Resale-oriented judgments and the requested condition/printing workflow are inferred from Henry's stated used-book business, not verified market research. No price, sales rank, or profit was measured.
- A 390×844 browser viewport approximates narrow layout only. It is not Henry's rugged Android phone and does not simulate camera, sound, vibration, Bluetooth input, or poor signal.
- Runtime observations describe the current working tree and its configured API, not a clean release build. Starting the local backend does not establish that the web app used it: Expo reported an existing API-base environment override.
- Duplicate-copy quantities and an Enter-suffixed Bluetooth scanner are proposed workflow assumptions. Neither hardware behavior nor 200–500-item performance was tested.
- Source-based findings describe inspected code paths, not executed stress tests. Saved-cache persistence is not proof that new offline scans resolve automatically or that an unfinished batch survives process death.
- The test list and annotations were created through the browser UI on the review origin; no existing user files were edited or removed. CSV availability and fields were inspected, but download/import round-tripping was not tested.
