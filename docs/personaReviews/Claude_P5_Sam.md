# Persona review: P5 Sam (heavy Goodreads user, data-portability hawk)

## Review basis

What I did in the UI, using Playwright against the local web build (http://localhost:8099):
- **Viewports and themes:** phone (390x844) and desktop (1280x900), in light and dark (dark through the system color scheme; I also looked at Settings > Appearance).
- **Search:** searched "Piranesi" (title filter) and "N. K. Jemisin" (author filter).
- **Work and edition:** opened the Piranesi work page, then used the edit lock, which made me save an edition (ISBN 9781635575637) to a new list, "Want to read". That took me to the edition's book page in edit mode.
- **Editing:** on the edition page I added subjects and a note, then locked to save.
- **Graph:** opened the graph for Piranesi and moved through it: Piranesi, then Susanna Clarke, then *Jonathan Strange & Mr Norrell*.
- **Other pages:** opened the "Labyrinths" subject page, the Susanna Clarke author page, Lists and Recommendations.
- **Import:** imported a 4-row Goodreads-format CSV I wrote myself. It used standard Goodreads columns, including the `="..."` ISBN quoting, My Rating, Exclusive Shelf and Bookshelves.
- **Export:** exported both the CSV and the JSON backup, and read the downloaded files.

What I could not test:
- Camera or batch scanning.
- A real iPhone.
- Restoring a JSON backup.
- A StoryGraph CSV.
- The home page. "/" showed a stray "Connect this item to…" screen because of an untracked file in the working tree (a test-setup issue), so I went straight to /search.

Other test-setup notes:
- The web build calls api.shelfthread.com, which blocks localhost through CORS. I rerouted those calls to the local backend.
- The backend was shared with another tester. The first visit to some data was very slow: about 3.5 minutes after I picked an edition to save, and about 3.5 minutes for the author page and for one graph step. Repeat visits were instant. I count this as a cold cache or upstream rate limiting in this environment, not a confirmed app bug. But a real user on a cold cache would just think it was broken.

## 1. Initial impressions; mobile vs desktop

Still "pretty frame". The cream background, serif headings, green pills and cover art feel more considered than Goodreads' beige. "Shelf Thread" is a real name now, not a placeholder; that's an improvement I asked for.

On density, though, it's a phone app. At 1280px every page is the same ~720px column in the middle of a gray field: no sidebar, no table and no multi-column work page. I'd do my library work (import, cleanup, export) on the laptop, and the laptop gets the least out of it. **I prefer mobile**, because it's the layout that was actually designed.

Small polish issues I noticed in the first minute:
- On a phone the "Language" filter placeholder is clipped to "Language (".
- A tooltip ("Find how this book links to another") sits on top of the "View as Graph" button label.
- The Wikidata logo in the footer is an empty white rectangle in dark mode.

## 2. Search and the book page

I found *Piranesi* right away. The first result was correct and had a cover. The rest of the list is mostly art books about G. B. Piranesi, which is fair for a title search. But one row reads "Henri Focillon, Henri Focillon, Henri Facillon": a duplicated author and a misspelled variant, shown as if they were three people.

**The work page is useful but messy inside:**
- **Helpful:** the rating with its source ("Hardcover + Open Library"), 20 editions with format, publisher and date, subjects, "More by this author", and on the edition page the LC call number, the Dewey number and a **Search on WorldCat** link. That WorldCat link is my Libby-ish shortcut, and I liked it.
- **Unhelpful or wrong:**
  - The work blurb shows raw Markdown: `**From the *New York Times* bestselling author…**`.
  - Edition dates come in four formats on one screen: "09.05.2022", "Sep 13, 2021", "2020-09-15" and "February 4, 2021".
  - The edition labels mix case ("hardcover" next to "Hardcover", "EAudiobook", "Gift").
  - "More by this author" lists both "Wood at Midwinter" and "The Wood at Midwinter".
  - It also shows a whole anthology contributor list with role words pasted into the names ("Author Reviewer Series Editor Cristina Bacchilega…").
  - It shows three near-identical Turkish box-set entries.
  - One subject is just "Dead".

## 2a. Work vs edition

I understand the distinction (FRBR, essentially). In the IA it mostly holds up: the work page has an edition carousel, and the edition page adds format, call numbers and library links. But my data-accuracy alarm went off. In the edition picker I chose the row labeled **"hardcover · Bloomsbury Publishing · Sep 15, 2020 · 9781635575637"**. The edition page for that ISBN says **Format: Trade Paperback** and shows the UK *Sunday Times* paperback cover. So the picker and the page disagree about the same ISBN. The blurb also changes between the two levels: the work uses the publisher's blurb and the edition uses Wikipedia. That's fine, but it isn't explained.

## 2b. Adding terms and notes

It works, but the affordance is buried:
- The only entry point is a small unlabeled padlock icon next to "Save to list". I knew what it did only because of its accessibility label ("Edit genres, subjects and notes").
- On a work, the lock forces you to save first: pick an edition, then pick or create a list. That's three steps before you can type a note.
- When I created the list, pressing Enter in the name field did nothing. I had to find "Create and add". Then "Done" took me to the edition page in edit mode.

Editing itself was simple:
- Removable × chips, an "Add a subject" field and a Notes box.
- After locking, I had my note and two new subjects.

Problems:
- No suggestions appeared while I typed. When I pressed Enter on the half-typed "Unreliable narr", it was saved as the subject **"Unreliable Narr"**: no vocabulary check and no confirmation.
- The UI title-cases my terms, while the JSON stores them as typed, so what I see isn't what I own.
- There's still **no reading status, no star rating, no date read**. I ended up writing "5 stars" inside a note, which is exactly the workaround I don't want.

## 3. Graph view

This is still the feature I'd come back for. The radial layout is clean, has a color legend, and offers Filter, List, Share and Back. Tapping Susanna Clarke and then *Jonathan Strange* re-centered it nicely, and that work's graph shows a Hugo Award node. "What's connected to this book" is a better browse model than Goodreads' shelves.

Criticisms:
- Subject nodes are raw Library of Congress strings cut off mid-heading ("Great Britain -- History -- 1800-1837 --…", "Magicians -- England -- History -- 19th…").
- There are many near-duplicates: Fantasy, Fantasy Fiction, Historical Fantasy, Fantasy Alternative History, Alternate History, "Fiction, Historical" and "Fiction, Historical, General".
- The Hugo Award node looked like the "Not yet linked" color rather than the "Award" color, which is hard to tell apart in the legend.
- One step took minutes on a cold cache, with only a spinner.
- Most important: **it's a graph of the catalog, not of my library**. My edits ("Islands") don't appear on the work graph. I want my imported shelf as the graph.

## 3a. Subject page

The "Labyrinths" page is helpful as a structure: a work count (286), a Wikidata description, broader and narrower topics, sort tabs (Most read, Top rated, Newest, Classic) and "View as Graph".

The content is noisy:
- Narrower topics include "Barnes Maze", "Radial Arm Maze" and "T-Maze", which are lab-rodent tests.
- The book list puts *Piranesi* and *House of Leaves* next to *Where's Waldo*, Rainbow Magic fairy books and Japanese light novels.
- The description starts in lowercase and doesn't say where it comes from.

It's a good starting point, but it needs curation, and I'd want to correct tags here rather than hide them.

## 4. Lists and recommendations

**Saving and lists:**
- Saving works, and lists are clear (Book lists, Author lists, a counter on each).
- My Goodreads import, though, landed in a generic "Saved books" list. None of my shelves (favorites, sff, ya, graphic-novels) became lists.

**Recommendations** are grouped by reason ("Because you like Science fiction (2 saved)", "More by Amie Kaufman", "More by N. K. Jemisin", "More by Susanna Clarke") and show what each book shares with mine. That transparency is good IA.

The books themselves are the most-read list from any library:
- *A Game of Thrones*, *Harry Potter*, *The Hunger Games*, *Twilight*, *1984*, *Dune*.
- *Twilight* qualified as "Science fiction".
- I've read or rejected all of these.

The useful rows are "More by [author]", which is exactly what I said I'd use this app for. Did I find a good recommendation? Not from the subject rows. From the author rows, yes, I'd go there.

## 5. Author page

I couldn't get an author page from search: the "Author" filter returns Jemisin's *books*, not an author entry. I reached Susanna Clarke by tapping her name on the work page. The first load took about 3.5 minutes in this environment.

**Helpful:**
- A Wikipedia bio with its source.
- Her awards: Hugo, Locus, World Fantasy, Mythopoeic, Women's Prize.
- Notable works.
- A "Save to list" for authors.

**Unhelpful:**
- An empty photo area that still says "Photo via Wikipedia".
- "01 November 1959 – present" (odd wording for a living author).
- The same messy works list as the work page: both *Wood at Midwinter* titles, the anthology with role words in the names, the Turkish box sets.
- No series grouping, and "what's in this series" is the other thing I came for.

## 6. Light vs dark

Both themes are well done:
- **Light ("Standard"):** warm and readable.
- **Dark:** good contrast, and the green accent keeps its identity.

Dark mode issues:
- The blank white Wikidata logo box.
- The raw-Markdown blurb is just as ugly in either theme.

Settings offers System, Standard and Dark. I'd rename "Standard" to "Light", because that's what every other app calls it. **I prefer dark** for evening library cleanup, but I don't feel strongly either way.

## 7. Three favorite things

1. **The graph as a way to browse** (author, then work, then awards and subjects), plus Back and Share.
2. **Library-grade metadata on the edition page:** LC and Dewey numbers, plus links to WorldCat, the LOC catalog, Open Library and Bookshop.
3. **The import, export and JSON backup exist at all.** The JSON keeps ISBN, Open Library and Wikidata IDs, subjects, genres and notes, and the app is upfront that the CSV marks everything "to-read". The honesty is appreciated.

## 8. Three least favorite things

1. **The Goodreads round trip loses data.**
   - My import dropped the reading status (read, currently-reading), My Rating (5, 3, 4), Date Read, my review, my shelves and the read count.
   - It skipped *The Silent Patient* ("no ISBN") without offering a title and author match.
   - The exported CSV sets **every book to Exclusive Shelf = to-read**, and has no My Rating or Date Read columns. Re-importing it into Goodreads would move my 5-star "read" book back to to-read.
   - The ISBN (10-digit) column is empty even though my file had it.
   - The file is still named `book-explorer-books-….csv`.
   - That's the lock-in or data-loss risk that would make me leave.
2. **Series and volume information is still stripped.** "Saga, Vol. 1 (Saga, #1)" imported as plain **"Saga"**. It's the exact complaint I made last time, and it hasn't changed. *The Fifth Season* kept "(The Broken Earth)" but lost "#1", so series handling is inconsistent even within one import.
3. **Messy data inside a pretty frame:**
   - Raw Markdown in blurbs.
   - Four date formats on one screen.
   - Duplicate and misspelled authors.
   - An edition picker that disagrees with the edition page about format.
   - Free-text subject entry that let me save "Unreliable Narr".

Honorable mention: the desktop layout is a stretched phone layout.

## 9. Features I'd want

- **Reading status and ratings** (read, currently-reading, to-read, DNF; stars; dates read), imported from and exported to the **exact Goodreads columns** (My Rating, Exclusive Shelf, Date Read, Bookshelves, Read Count). StoryGraph as well.
- **Goodreads shelves become lists** on import. Rows without an ISBN are matched by title and author, with a review step instead of a silent skip.
- **Series as real data:** "Saga, Vol. 1", series pages and reading order. Also a "what's in this series" view on the work and author pages.
- **The graph built from my own library:** my shelves as the starting points, with clusters by subject and author.
- **A desktop layout made for density:** a sortable table of my library, bulk editing of tags and status, and a side-by-side graph and details panel.
- **Subject suggestions from a controlled vocabulary** (the field exists; nothing appeared), and normalization of LCSH strings into readable labels.
- **Batch scan for my shelves** (I couldn't test it here), plus a library availability shortcut beyond WorldCat.
- **Optional sharing or sync** of my reading data with friends, opt-in, without a Goodreads-style social feed.

## 10. Overall

Shelf Thread is a better-looking and more distinctive explorer than it was. The graph, the LOC and WorldCat links, and the honest JSON backup are real strengths. But I came for **clean data portability and accurate metadata**, and it falls short on both:
- The Goodreads import throws away exactly the fields I've maintained for ten years.
- The export would actively damage my Goodreads data if I re-imported it.
- Series information is still missing.

Right now it's a good catalog browser and a poor home for my library.

## 11. Ease of use and accessibility

The basic flows are easy for someone like me: search, open, graph and save. The editing flow is not:
- The padlock icon gives no visible hint of what it does.
- The forced save before editing adds three steps.
- Pressing Enter does nothing in "Create new list".
- An inline cold-load wait of several minutes showed only a spinner.

I didn't need any accessibility features. I did notice the icon-only controls have good accessible labels ("Edit genres, subjects and notes"), which is better than their visual affordance. Light and dark both read well.

## 12. Would I use it again?

Yes, but only as a **side tool** for "more by this author", graph browsing and WorldCat or LOC lookups. I wouldn't use it as my library of record. I'd move my library over once a Goodreads CSV goes in and comes back out with status, rating, dates, shelves and series intact. Until then, Goodreads and StoryGraph stay my source of truth.

## Assumptions outside the persona

- **I wrote a 4-row Goodreads CSV** in the standard column layout, with sample titles, ratings and shelves. The persona says she'd import her CSV but doesn't define its contents.
- **I treated the minutes-long first loads as environmental.** The backend was shared and the cache was cold. I didn't confirm whether this happens in production.
- **I assumed Sam would prefer dark mode** for evening use. The persona doesn't state a theme preference.
- **The specific books** (*Piranesi*, *Jonathan Strange*, *The Fifth Season*, *Illuminae*, *Saga*, *The Silent Patient*) are my picks as plausible reads for her. Only *Saga* comes from the persona file.
- **I assumed she'd know FRBR** (the work vs edition model) as a UX researcher who has used LibraryThing.
