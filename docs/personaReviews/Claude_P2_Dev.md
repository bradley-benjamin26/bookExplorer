# Persona Review: P2 Dev (18, comics and sci-fi, Android, dark mode)

## Review basis

**What I actually did (local web build, Playwright, 2026-10-27):**
- Phone viewport (390x844) in dark mode for most of the session. Spot checks at desktop (1280x900) in dark and light, and phone in light.
- Searched for Saga, Neuromancer, Leviathan Wakes, Hyperion, Horus Rising and Fiona Staples. I also tried the Author search filter with William Gibson.
- Opened the Saga Vol. 5 work page, its single edition (ISBN 9781632154385) and the Neuromancer work page with its 47 editions.
- Unlocked editing on Saga: added the genre "Space Opera", added the subject "Fiona Staples (artist)", removed "Parents of Racially Mixed Children", wrote a note, locked it, then reloaded. Everything stuck.
- Made a list called "Comic Pile" with five items, looked at Recommendations, and saw the CSV/JSON export buttons on the list page.
- Graph: Saga, Neuromancer, William Gibson and Frank Herbert. I tapped nodes, opened Filter and switched to List view.
- Subject pages: "Hackers -- Fiction" and "Cyberpunk Fiction", including the sort tabs.
- Author pages: William Gibson, Frank Herbert and Isaac Asimov. From Asimov's page I followed an "Influenced" link to Cory Doctorow.
- Looked at Settings (theme picker) and the Scan screen.

**Couldn't test:**
- Barcode scanning, single or batch. The browser has no camera, so I only saw the "Grant Permission" screen. That's my #1 use case and it's untested.
- A real mid-range Android phone, haptics, and actual install or performance.
- **Environment problems (not the persona's fault):**
  - `/` opened a stray "connection (1) / Connect this item to…" screen, which comes from an untracked file in the working tree. I went straight to `/search`.
  - The local web build calls `https://api.shelfthread.com`, and CORS blocks that from localhost, so every search showed "Failed to fetch". To get past it, my test harness sent those requests to the local backend at `localhost:3001`. I changed no app code.

---

## 1. Initial impressions; mobile vs desktop

Dark mode out of the box (it follows the system setting) is clean. Teal accent, serif headings, no cartoon mascot, so nothing childish. The empty search screen is a bit dead, though: one input, a "Filters" label, and a Wikidata badge. There's no "scan" button anywhere on it, which is wild for something that pitches scanning.

**Mobile wins.** On desktop the whole app is a roughly 720px column with black bars on both sides, so it's the phone layout in letterbox. The one place desktop is better is the graph: labels are actually readable at 1280px. I'm on my phone in the shop anyway, so mobile.

## 2. Search for a book, go to its page

I searched "Saga". Results came up fast with covers. But there are five separate "Saga — Brian K. Vaughan" rows and no volume numbers on most of them, so I had to guess. I picked "Saga, Volume Five". On the work page the title then turns back into plain **"Saga"**. The only thing telling me it's Vol. 5 is the word FIVE on the cover art. For a comic, that's the main thing I needed to know.

**Helpful:**
- The rating shows up front: 4.4 from 419 ratings, "Hardcover + Open Library". That's the in-shop check I want.
- The blurb.
- "More by this author" includes *Paper Girls* and *Y: The Last Man*, and those **do** credit the artists (Cliff Chiang, Pia Guerra).
- On Neuromancer, the Awards section (Hugo, Nebula) is goated.

**Unhelpful:**
- **Saga is credited to Vaughan only. No Fiona Staples.** That's the exact complaint I had last time. The weird part: when I searched "Fiona Staples", the result rows *do* say "Brian K. Vaughan, Fiona Staples". So the data exists and this work record just doesn't have it.
- Subjects are still raw database junk: "Parents of Exceptional Children", "Military Deserters", "Parents of Racially Mixed Children". Neuromancer has 40 subjects, including "Reading Level-Grade 7" through "Grade 12", "Specimens", "813/.54" and a call number shown as a tag. No "Space Opera" chip on Saga.
- The edition page has no issue range in the metadata. "#25-30" only shows because it's in the About text.

## 2a. Work vs edition

I get the idea: a work is the story, an edition is the physical book. The app doesn't make it obvious, though:
- The only difference is the tiny header label ("Work" vs "Book"). Both pages say "Saga", with the same cover, rating and buttons.
- The edition page doesn't show its own ISBN, publisher or format at the top.
- I couldn't find a link from the edition back to the work, apart from the browser back button.
- On Neuromancer, "Find Your Edition (47)" is a huge horizontal wall: Turkish, Russian and Italian printings, cassettes, "s.n.]". There's no filter for language or format.
- For comics, the "edition" I care about is the *volume*, and the app doesn't model that at all.

## 2b. Add terms and notes

It worked, after a detour:
1. I tapped the little padlock. It said I have to save the book to a list first.
2. Then it made me pick an edition.
3. Then it made me pick or create a list. In the create-list sheet I hit the big green **Done** button, not **Create and add**. That silently didn't create the list, and I got dumped back to the page. Two confirm buttons stacked on top of each other is a trap.
4. Second try worked. I got a clean editor: genre input, subject input, × on every tag and a notes box.
5. I added "Space Opera", removed the racist-sounding tag, and wrote "Vol 5, issues 25-30. Already own 1-4. Grab 6 next." I locked it and reloaded. It all persisted. Respect.

Two catches:
- My "Fiona Staples (artist)" got title-cased to "(Artist)".
- My edits **don't flow into the graph.** The Saga graph still shows "Parents of Racially Mixed Children" and no Space Opera. So I can fix the tags, but the rabbit hole ignores my fixes.

## 3. Graph view

It still feels like a skill tree, and I still like it. Each tap re-centres on the node you tapped:
- Saga → Brian K. Vaughan: his works fan out (Y: The Last Man vols, Paper Girls, Saga vols), and a "‹ Back" button appears.
- There's now a **Filter** (node types: Book/Author/Subject/Genre/Editions; edge types: wrote/about/has). That's exactly what I asked for.
- The **List** toggle turns the graph into a readable list with "wrote"/"about" explanations. Lowkey the most useful mode.

But:
- On a phone the labels are still about 8px. I had to squint at "Parents of Racially Mixed Children" to even read it.
- Saga's graph has zero comic-specific nodes: no artist, no publisher (Image), no series.
- On Saga, tapping a label (text) did nothing. Only tapping the circle itself worked.
- The Neuromancer graph showed different genre nodes on two loads ("Cyberpunk Novel" and "Dystopian Fiction" showed up on one and not the other). That's inconsistent, and it threw me off.
- No author-to-author "influenced" edges showed up in the Gibson or Herbert graphs.

## 3a. Subject page

- **"Hackers -- Fiction":** the header says "0 works", then it lists two books (Neuromancer, Little Brother). Contradicts itself in the first two lines.
- **"Cyberpunk Fiction":** better. There's a "Broader topics: Science Fiction" link, plus Most read / Top rated / Newest / Classic tabs. It says "13 works" and lists about 18. The list is half academic books ("Neoliberalism and Cyberpunk Science Fiction", "Understanding William Gibson"), a Russian and a Hungarian title, and a book credited to "Copyright Paperback Collection (Library of Congress)".
- **No Snow Crash, no Altered Carbon, no Do Androids Dream.** The "Top rated" tab barely re-orders anything.

As a cyberpunk rabbit hole it's mid. The bones are there (sort tabs, broader-topic links), but the data lets it down.

## 4. Lists and recommendations

Saving was clunky at first. Every "Save to list" opens an edition picker; with Leviathan Wakes that's a wall of ISBNs. You have to know to hit "Save the work instead". After that it's quick, and the list page has **Export CSV / Export JSON**. W, that's what I wanted.

Recommendations with Saga, Leviathan Wakes, Neuromancer, Hyperion and Horus Rising saved:
- The rows are grouped like "Because you like Hugo Award Winner (2 saved)": Dune, Rendezvous with Rama, The Dispossessed, A Game of Thrones, The Three-Body Problem, Canticle for Leibowitz, American Gods, Coraline.
- The other groups are "Long Now Manual for Civilization", "Extraterrestrial beings", "Interplanetary voyages" and "Conspiracies".

What works and what doesn't:
- Showing *why* ("shares: Hugo Award Winner, Interplanetary voyages") is nice and transparent.
- But it's all prestige-list classics. **Zero comics.** Saga and Horus Rising had no visible influence on it. No Warhammer, no Expanse-adjacent stuff. Coraline because I like Hugo winners? Mid.
- Three-Body Problem shows in Chinese (三体), with a "Волтер Майкл Міллер-молодший" credit on Canticle.

Any good ones? Hyperion fans will be fine with The Dispossessed. Everything else I already knew.

## 5. Author search and page

- **Finding the author:** the "Author" search filter returns *books by* William Gibson, not William Gibson himself. It also mixed in *The Miracle Worker*, which is a different William Gibson (the playwright). I got to his author page by tapping the underlined name on a book page. Findable, just not via the search I was told to use.
- **Gibson's page:** dates, a decent Wikipedia bio, a Works list. The bio shows raw markdown junk: "([Source][1])" and "[1]: http://en.wikipedia.org/…". There were no "Influenced by"/"Influenced" sections for Gibson or Frank Herbert, which is the stuff I most wanted.
- **Asimov's page:** it does have "Influenced", plus Notable Works and a huge Awards list. "Influenced" lists Paul Krugman, Cory Doctorow, **Peter Thiel**, and two people I've never heard of. Tapping Doctorow took me to his author page, so the rabbit hole mechanic works when the data is there. Coverage is just spotty and random.

## 6. Light vs dark

- **Dark:** charcoal background, off-white serif titles, muted teal buttons. Covers pop. Clean, still my default.
- **Light:** a warm cream "paper" look with dark green buttons. It's well done, readable, and looks like a nice library app, which is exactly the vibe I don't want.
- The graph actually reads a bit better in light (darker node colours, better label contrast).
- Settings has System / Standard / Dark, so I'd lock it to Dark.

I prefer dark, no contest.

## 7. Top 3 favourites

1. The graph's **Filter + List toggle**. It's finally a skill tree I can filter.
2. **Editable genres/subjects/notes that persist**, plus **CSV/JSON export**. I can fix the junk tags and own my data.
3. **Rating up front** and the **Awards** section. That's the in-shop "is this worth $17" check.

## 8. Top 3 least favourites

1. **Comics are second-class:**
   - Saga credits only Vaughan, with no artist.
   - No volume or issue number in the title.
   - Five identical "Saga" search rows.
   - No comic recs at all.
2. **Tags are still raw database junk**: reading levels, call numbers, "Specimens". My edits don't reach the graph.
3. **Friction in core flows:**
   - Edition picker on every save.
   - The Done vs "Create and add" trap.
   - Author search returns books.
   - "0 works" on a subject page that lists works.

## 9. Features I'd want

- Series/volume/issue fields and a "next volume" link. Also "you own 1-4, you're missing 5".
- Proper creator roles (writer, artist, colourist, letterer), with artists clickable into the graph.
- Comic data sources: ComicVine, Grand Comics Database, or MyAnimeList for manga.
- Batch scan straight into a list with series grouping. It apparently exists, I just couldn't test it.
- A graph that uses my edited tags, bigger mobile labels or label zoom, and author-to-author "influenced" edges inside the graph.
- Real subgenre chips (Cyberpunk, Space Opera, Grimdark) mapped from the messy subjects.
- Hide library stuff by default. "My Library", WorldCat, LOC catalog and "Add your library" are all in my face.

## 10. Overall

Solid bones and a nerdy core: the graph, the filters and the exports. It treats prose sci-fi pretty well. It still doesn't respect comics, and the data underneath (Open Library subjects, missing artists, spotty influences) keeps leaking through the nice UI. Right now it's a 6/10 for me. The app is fine; the comics metadata is the problem.

## 11. Ease of use / accessibility

- **Mostly easy:** big buttons and clear back arrows, and the List view in the graph is a great fallback.
- **Where I tripped:** the padlock → edition → list chain, and the two-button list sheet.
- **Tooltips:** on phone they pop up over the next button ("See this book's authors…" covers Find Connection).
- **Accessibility features:** I didn't use any. The only one I'd want is bigger graph labels; pinch/zoom buttons exist but don't scale the text much.

## 12. Use again?

Yeah, for rabbit-holing sci-fi authors and exporting my list. For comics, which is half my shelf, not until it knows Fiona Staples drew Saga and tells me which volume I'm holding. If scanning actually works in the shop, that could flip me to a regular.

---

## Assumptions outside the persona

- I treated Saga Vol. 5, Neuromancer, Leviathan Wakes, Hyperion and Horus Rising (Warhammer 40k/Horus Heresy) as books Dev would pick. The persona names Saga, The Expanse and Warhammer 40k, but not those exact titles.
- I assumed Dev would rather "Save the work instead" than pick an ISBN edition, and that he'd remove the "Parents of Racially Mixed Children" tag when editing.
- I assumed a $17 trade price in the in-shop scenario. That's illustrative only.
- Desktop and light mode were judged from screenshots. The persona doesn't say Dev uses a desktop browser for this.
- I judged scanning only from the permission screen and assumed it's the gateway feature for him. Real scanning wasn't tested.
- The web build behaves the same as the Android app for everything except the camera.
- The 6/10 score is my own scale, not in the persona doc.
