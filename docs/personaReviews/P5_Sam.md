# P5 Sam — UX review

**Review method:** I reviewed the app source; I did not start the app or interact with a running UI. So this is an implementation-based assessment, not a report of successful searches, pages, recommendations, or screen-reader behavior. I can't verify the live metadata or compare rendered mobile and desktop layouts.

## 1) First impressions; mobile or desktop?

From the implementation, this reads as a book-discovery and relationship-browsing tool, not an ebook reader: the home screen offers scan, title/author/ISBN search, and browsing history; details lead to authors, subjects, editions, and a graph. That is a more distinctive proposition than a generic reader. The shared app targets phone and web, but I can't judge visual polish or which layout works better without seeing them. If I have to choose for my own use, I'd choose mobile for browsing library or used-bookstore shelves, then use the laptop for dense catalog work.

## 2) Find a book and describe its page

I can't honestly say I found a particular book: I didn't run a search or get a live result. The source does provide title, author, and subject search modes, plus year and language filters; home search also accepts an ISBN. Search results open a **work** page. Its structure is promising for my use: author links, an aggregate rating when available, description, editions, subjects and genres, series, more by the author, reviews, and ways to find a copy. I would want to verify each record's author and edition data against the actual sources before trusting it as my catalog.

### 2a) Work versus an edition

The distinction is represented consistently in the code: a work has an editions section and series/author relationships; a book page is keyed by ISBN and can show edition-specific format and lookup links. The About page also explains that a work groups editions. The model makes sense to me, but I would want the interface itself to label the transition plainly—“work (all editions)” versus “edition (this ISBN)”—rather than make people infer the information architecture from “Work” and “Book.”

### 2b) Add terms and notes

Yes, the source provides editable genres and subjects, and notes for saved books or works. The catch is that editing is gated: the item has to be saved first, then the lock/edit control has to be opened. Term suggestions are available after typing, and notes save after a pause. This is workable, but I would expect the save-first requirement to be clear before I start editing; local tags and notes matter to me and should not feel like temporary annotations.

## 3) Graph view

The graph implementation supports pan/zoom, filters for node types and relationships, an alternate list view, and recentering on linked nodes; the center node opens its detail page. That sounds like a useful way to explore connections rather than another popularity feed. My concern is whether the displayed links are reliable and legible at real library scale; source inspection can't establish how crowded a particular graph is or whether its metadata is accurate. I did not tap any nodes.

### 3a) Subject page

I did not open a live subject page, so I can't judge a particular subject's coverage or usefulness. In source, a subject page can show a work count, optional description, broader and narrower topics, and a book list with several sort choices. That is a good browse structure. For a heavy reader, a subject label and count are not enough by themselves: I want clear subject provenance and enough context to tell a precise topic from a broad catalog bucket.

## 4) Lists and recommendations

I couldn't test saving an item or judge whether any live recommendation was good. The implementation builds recommendations from saved items, groups results by what they share with my library, and can display the shared author or subject as an explanation. Existing ratings can influence ranking. That is more useful to me than an unexplained “you may also like,” and list-specific recommendations are supported. I would still compare the output against my actual reading history: the CSV importer doesn't appear to preserve read status or ratings, so an imported to-read pile may not represent my taste accurately.

## 5) Author search and page

The search screen has an Author mode, and the author page can show a biography, dates, pseudonyms, relations, works, and a graph when the data is available. It also explicitly tells the user when there is no Wikidata match. I did not search for an author or confirm that a result opens, and I can't assess biography or authorship accuracy from source. For me, accurate identity and a complete “more by this author” list matter more than social features.

## 6) “Free Book Reader” name

The current source brands the app **Shelf Thread**, not “Free Book Reader.” “Free Book Reader” sounds like an ebook-reading product and doesn't communicate the graph or catalog angle. Shelf Thread is more distinctive and suggests linked reading, though it is a little abstract. My suggested **Book Threads** is more immediately about books while keeping the connection metaphor.

## 7) Three favorite things

1. The product concept is about following links between works, subjects, and authors—not rebuilding Goodreads' social feed.
2. The work/edition model, series section, and author/subject routes could make “more by this author” and “what's in this series?” genuinely useful.
3. There is real portability and collecting functionality: Goodreads/StoryGraph CSV import, JSON backup, batch scanning, lists, and configurable local-library search links.

## 8) Three least favorite things

1. CSV round-tripping is materially lossy. The importer reads title and ISBN; the exporter writes every item with `Exclusive Shelf` set to `to-read`, and does not export a rating or reading status. Lists become shelf names, while subjects and genres are only retained in JSON. That is not a clean Goodreads mapping for someone with a decade of history.
2. The saved-record model has notes, genres, and subjects, but no personal reading status or personal star rating. The rating shown on details is an aggregate from external sources, not my own rating.
3. Some high-value context is conditional or secondary: for example, series data only appears when available and is placed below other work-page sections. I'd want series position and edition identity to be easy to verify, not something I have to hunt for.

## 9) New features that would interest me

- A loss-aware Goodreads/StoryGraph importer/exporter that maps read/to-read/currently-reading, my rating, dates, shelves, and notes explicitly, with a preview of fields that will be dropped or changed.
- A graph generated from my imported/saved library, not only a graph centered on one work, author, or subject.
- More visible metadata provenance and correction/merge tools for duplicate or mistaken author and edition records.
- Direct, useful library handoff: the source already supports WorldCat and configurable catalog-search templates, but I'd like a reliable Libby/catalog shortcut that makes availability and next steps clear.
- Keep batch scanning; it is already present in the implementation. I'd want the scan-and-save workflow to preserve the same clean metadata and provenance as a manually curated record.

## 10) Overall

There is a clear gap this app could fill: a personal-library-driven way to explore connections, authors, and series without repeating Goodreads' social layer. The breadth of import/export and scanning is encouraging, but the current CSV mapping would not let me trust it as the home for my reading history. I would treat it as a companion discovery tool until it preserves status, ratings, and shelf semantics accurately.

## 11) Ease of use and accessibility

I can't report whether I found the app easy to use or needed accessibility features because I did not interact with the UI. The source includes accessibility labels and hints on key controls, an alternate graph list, and code to open that list automatically for screen-reader users. Those are sensible affordances, but they are not a substitute for testing keyboard navigation, focus order, VoiceOver, or the actual graph interaction.

## 12) Would I use this app again?

I'd try it as a companion for exploring “more by this author,” a series, or a subject—and for finding a copy through a library link. I would not move my main Goodreads/StoryGraph history into it until the CSV mapping preserves my reading status and ratings, and I could verify the imported records. A pretty frame is not enough if the data inside changes meaning.

## Assumptions

- This review describes the current checked-out source, not a running or deployed build. No live search, record, graph, subject, recommendation, or accessibility behavior was verified.
- The source supports optional/aggregated external metadata, but I could not verify the completeness, correctness, or freshness of any upstream records.
- “Free Book Reader” is treated as the name in the question; source branding currently says “Shelf Thread.”
- My mobile preference is a persona-based preference for browsing in bookstores and libraries, not a finding from a mobile-versus-desktop usability test.
