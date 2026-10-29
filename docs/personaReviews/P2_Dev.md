# P2 — Dev, 18: persona UX review

## Review basis

I reviewed the current implementation and **actually interacted with the running web UI**, using a separate local backend on port 3187 and Expo web on port 8187. I inspected the interface at a 390 × 844 phone-sized viewport and a 1440 × 1000 desktop viewport, with browser dark-mode emulation. This was not a physical Android test.

Verified journeys: Saga search → work → paperback edition; list creation and saving two books; adding a genre and notes and checking them after reload; graph navigation through Brian K. Vaughan and Paper Girls; hiding graph subjects; opening a subject page; list-filtered recommendations; and author search → work → author page. Camera scanning, export downloads, assistive technology, and native performance were not tested.

**Working-tree caveat:** `/` and the “Shelf Thread” home link actually landed on a screen titled `connection (1)` with “Connect this item to…”, not the intended home screen. The existing untracked `apps/app/app/connection (1).tsx` makes routing contamination plausible, but I did not establish the cause or change that file. I used explicit search URLs to continue. Comments about the intended home screen are source-based, not a claim that I successfully used it.

## 1) Initial impressions; mobile or desktop?

Dark mode is clean. The Saga cover gets room to breathe, the green buttons look grown-up, and nothing screams “reading app for little kids.” The actual first landing was confusing, though: why am I connecting an unspecified item before I have picked a book?

Once on the book screen, **mobile wins for my shop use**. The cover, rating, save action, and graph button are obvious. Desktop is readable but remains a centered column instead of making much use of my monitor. I would use that for sitting down to catalogue; the phone is what I would have at the comic shop. This comparison is browser-based, not a test of my Android.

Evidence: observed Saga screens; intended search/scan home in `apps/app/app/index.tsx`; centered width-capped shell in `apps/app/app/_layout.tsx`.

## 2) Find a book and inspect its information

I searched **Saga** and opened the first result, work `OL16799356W`. Yes, I found something I would read. Getting there was easy; deciding which result was which was more mid. Several results were just “Saga — Brian K. Vaughan,” while other rows explicitly said Volume Five or Volume Seven. Unrelated-looking titles such as Twilight also appeared.

The work showed a cover, **4.4 from 1,116 ratings**, with “Hardcover + Open Library” attribution, a description, editions, subjects, and more by the author. A quick rating with its count is useful before spending money. I did not independently verify the rating calculation.

Comics respect is uneven. **Fiona Staples was named in the description but not in the clickable creator credits**, which listed only Vaughan. Paper Girls did list both Vaughan and Cliff Chiang, so this is not “the app can only show one person.” In its graph, however, Chiang's connection was called “wrote,” not an artist credit.

Saga's visible subjects included “Parents of Racially Mixed Children,” while the useful science-fiction comics term was behind “Show all 9 subjects.” I independently saw that in this run; it is not just copied from my old complaint. No dedicated volume or series-order section appeared for this Saga record. The cover said “ONE,” but I should not have to inspect cover art to confirm what I am buying.

Evidence: live `/search?q=Saga`, `/work/OL16799356W`, `/book/9781607066019`, and Paper Girls graph/work screens.

## 2a) Work versus edition

I opened “Find Your Edition” → **Paperback / Image Comics / 2016**, landing at ISBN `9781607066019`. Conceptually, yes: the work is the story; the edition is the particular thing on my shelf.

The UI only half teaches that. The headers change from **Work** to **Book**, not “Work” to “Edition.” Both pages lead with “Saga,” the same creator and rating, so it can feel like I opened the same page twice. The edition showed its paperback format and buying/catalogue links, but not a prominent volume number. Later the work helpfully showed my saved paperback's ISBN.

Saving Paper Girls from its work page also offered “Choose an edition” or “Save the work instead.” That makes sense once I understand the model, but it is another decision before saving. Keep the distinction, explain it in normal collection language.

Evidence: observed edition navigation and save sheet; `src/components/EditionsSection.tsx` and `src/components/WorkSaveButton.tsx`.

## 2b) Add terms and notes

I clicked the lock/edit action on Saga's edition. It required saving to a list first. I created **Dev shelf**, saved the book, entered **Space Opera** as a genre, and wrote “Check volume before buying; Fiona Staples art.” I locked the edits and reloaded the page: **both the genre and note remained**.

That works, and being allowed to add my own genre is goated. The friction is discovering that a little padlock means “edit,” then doing list setup before writing one note. I added a genre rather than a separate subject; both input types were present. These are personal catalogue edits, not a verified correction to everybody's public metadata.

Evidence: live save/edit/reload journey; `src/components/TermsSection.tsx`, `src/components/SavedRecordEditor.tsx`, and `src/useEditLock.ts`.

## 3) Explore the graph

I clicked **View as Graph** from Saga, then the **Brian K. Vaughan** node, then **Paper Girls, Vol. 1**, then the centered Paper Girls node to open its page. The graph re-centered in place and provided its own Back action. That genuinely feels like moving through a skill tree, not being dumped into unrelated search results.

I opened Filter and hid **Subject** nodes; the subject nodes disappeared and the graph kept creators and editions. Excellent: graph filtering already exists, so I am not asking you to invent it.

The labels are still tiny on the phone-sized canvas. Long subjects wrap into small stacks, and some subjects are database junk: Paper Girls even had a `Pn6728.P36 V38 2016 V. 1` node. A filter removes the whole subject category, not just that useless term. Zoom controls and a List alternative were visible, but I did not test their behavior.

Also, my saved “Space Opera” genre did **not** appear in the Saga graph I opened. Personal organizing and public exploration felt disconnected.

Evidence: live `/graph/work/OL16799356W`, subsequent in-place centers, and the `hideTypes=subject` filter state.

## 3a) Open a subject page

I clicked **Comics & Graphic Novels, Science Fiction** on Paper Girls. Its page showed **7,860 works**, graph access, and Most read / Top rated / Newest / Classic sort controls.

Useful starting point, not a curated comics shelf. The initial visible list included Watchmen, Transformers, and Powers, but also The Time Machine and other titles without edition/context explaining whether they were comics adaptations. A sorting spinner was present during that observation; I did not verify the final sorted list or try every sort. I would use it to browse, not trust every result to be the format I meant. No explanatory subject description was visible in that visit.

Evidence: live `/subject/comics_&_graphic_novels_science_fiction`; optional description and topic hierarchy rendering in `app/subject/[slug].tsx`.

## 4) Lists and recommendations

I saved **Saga's paperback** and **Paper Girls, Vol. 1 as a work** to Dev shelf. The list showed **2 books**, and both titles were present. I then opened Recommendations by URL and selected the **Dev shelf** filter; I did not verify a direct recommendations link from the list page.

The first expanded group was “Because you like Comic books, strips,” containing O Alquimista, Twilight, Dickens, and other broad matches. Saving two sci-fi comics does not mean I want everything with a comics-related database tag.

Opening **More by Brian K. Vaughan** was much better: **Paper Girls, Vol. 2**, Saga Volume Five, and Saga Volume Seven. Paper Girls 2 is a useful next step. Five and Seven without a reading-order cue are less useful when the saved Saga is volume one. I like the visible “shares” explanations; the first recommendation group just needs better taste than a random loot table.

Evidence: live list detail, Recommendations list filter, and expanded creator recommendation group; `src/components/RecommendationsSection.tsx`.

## 5) Search for an author and access their page

I searched **Brian K. Vaughan**, opened Filters, selected Author, opened a Saga result, then clicked Vaughan's name. **Yes, I reached `/author/OL1399650A`.** Author mode still returned books, not a directly selectable author profile, so it took an extra hop.

The page's works list was useful. Its bio was only “American screenwriter, comic book creator,” and the dates displayed **`1976 – ....).`** That looks like unclean source data. I did not see Influenced or Influenced by sections on this record. The implementation supports those sections when relationship data exists; I cannot promise that rabbit hole for this creator.

One ordinary automated click on the Author filter timed out; a forced browser click worked. That is a test limitation, not enough evidence to declare the control broken for people.

Evidence: live author search/work/profile journey; conditional relationship sections in `app/author/[id].tsx`.

## 6) The name “Free Book Reader”

That sounds like I can read comics in the app for free. The flows I used were discovery and collecting, not a reader. **Shelf Space** is still my pick. The current UI and README actually say **Shelf Thread**, which fits the links/graph idea much better than Free Book Reader. I am answering the proposed name, not claiming it appeared on screen.

## 7) Three favorite things

1. **Dark presentation and cover-first detail pages.** Clean, not childish.
2. **The navigable, filterable graph.** Real creator-to-book rabbit holes.
3. **Personal lists, genres, and notes that survived reload.** Useful collection tools, not just a search demo.

## 8) Three least favorite things

1. **Patchy creator and volume identity.** Staples missing from linked credits, artist roles flattened, ambiguous Saga results.
2. **Raw subject data driving discovery.** Tiny graph labels make that clutter worse; broad recommendation matches are not my taste.
3. **“My Library” as the main collection hub.** I did use it to reach Lists, but it sounds like borrowing. The edition's call numbers and library-setup prompt are not buying information for me. They are mostly lower down, not literally on every screen.

The unexpected home landing is a separate current-working-tree caveat, not something I can confidently blame on the intended product.

## 9) Features I would want

- Reliable **series, volume, issue, and collected-issue ranges**, with an obvious next unread volume.
- Linked **writer, artist, colorist, letterer, and cover-artist credits** with the correct roles.
- Cleaner Cyberpunk/Space Opera-style browsing and finer graph filtering, including hiding individual junk terms and an option to explore my own tags.
- An owned-versus-wanted collection state and duplicate-volume warning for shop decisions.

**Batch scanning and export already have implementations** (`app/scan.tsx`, `src/components/BatchScan.tsx`, `src/components/BackupSection.tsx`); list export buttons were also visible. Those are exactly my kind of features, but I did not scan a shelf or download an export, so I cannot endorse their reliability. The scanner code is ISBN-oriented; single-issue comic barcode coverage remains unverified. Export help also says CSV marks every book “to-read,” which is not the same thing as my owned collection.

## 10) Overall thoughts

There is a genuinely cool discovery tool here. The graph and dark UI get me interested; the uneven comics metadata stops it from being my trusted “should I buy this exact volume?” app. Better records matter more to me than another catalogue link.

## 11) Ease of use and accessibility

Search, edition opening, and basic saves were manageable. The lock-to-edit interaction, work/book terminology, indirect author access, and home-routing anomaly required interpretation.

I used dark-mode emulation, not an assistive technology. I did **not** test TalkBack, keyboard-only navigation, large text, physical touch targets, or contrast compliance. The phone-sized graph labels were hard to read visually. List and zoom controls suggest alternatives, but their presence is not proof of accessibility. I have no persona basis for claiming a disability or a need for a screen reader.

## 12) Would I return?

**Yes for rabbit holes and a small collection trial; not yet as my only shop-check app.** I would come back for creator exploration and Paper Girls recommendations. I would still double-check the volume and creative team before paying. No chance I am returning for Dewey numbers.

## Assumptions

- This is a simulated response from the complete assigned Dev persona, not testimony from a real participant. New preferences such as an owned/wanted state and duplicate warning are inferred suggestions, not additional supplied biography.
- Saga and Paper Girls were representative choices for Dev's stated interests. This run does not establish coverage for The Expanse, Warhammer 40k, manga, every comic, or every creator.
- Browser viewport and dark-scheme emulation approximate presentation, not a mid-range Android's camera, performance, touch behavior, or OS accessibility.
- Live catalogue results and ratings are observations from this session and may change. Missing information on these records does not establish that the feature is absent globally.
- “Volume one” for the visited Saga is inferred from its displayed “ONE” cover and first-arc description; it was not supplied by a verified dedicated volume field.
- Test saves and edits used browser-local data on the review origin. Reload persistence was verified there, not cross-device sync or backup restoration.
- The root-route anomaly may relate to the existing duplicate route file; causation remains unverified. Existing untracked files were left untouched.
- Source-based statements about batch scanning, export, optional relationship data, and editing behavior are explicitly not claims of successful end-to-end testing.
