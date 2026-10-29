# P3 Jordan — persona-based UX review

*22, recent graduate, busy marketing coordinator; reading for fun again and trying to fit books into a full week.*

**Evidence note:** I interacted with an already-running desktop web app in the browser, using its accessibility snapshots. I initially landed on **/graph/subject/dragons**, but its center node and heading said *The Hobbit*. Clicking the brand link to **/** showed “Connect this item to…” rather than the home screen. That mismatch could be stale dev-server/routing state, so I’m not treating it as definitive product behavior. I could open Search, enter “Emily Henry,” and submit the query. The results included current Emily Henry titles, but also duplicate/variant titles, a boxed set, and large floor-display listings. A result click timed out while the list was changing; the browser then reported that Metro had disconnected and the app could no longer be reloaded. I did not restart it or claim to have completed detail-page, graph-node, subject, saving, recommendation, author-page, or mobile interactions. Those parts below are based on inspected source unless explicitly noted.

## 1) Initial impressions; mobile or desktop?

The graph has a nice “follow the thread” idea: a legend separates authors, books, subjects, and editions, and the screen explains that tapping a node moves the view. It looks more like an exploration tool than a reading tracker. It can also get busy fast—there are many labels and controls competing for attention, and I wanted a clear “just show me my next book” option.

I did not see a clean first-launch home screen in the running UI, so my first-impression read of that screen is from source: it offers a prominent **Scan a book** button and a search field, with “find your next read” as the subtitle. That is a good low-friction start; it does not appear to require setup before search. The source also caps the app’s content width on wide screens, while allowing it to fill a phone-width screen.

I can’t fairly pick mobile or desktop from this session: I interacted with the desktop web version, not an iPhone-sized view or native app. As Jordan, I’d expect to use it on my phone in a spare five minutes or on my commute, so mobile is the more important experience for me—but that’s a persona-based preference, not a tested comparison.

## 2) Search for a book; book-page experience

I searched for **Emily Henry** in the running UI. Search returned recognizable books, including *Beach Read*, *People We Meet on Vacation*, *Happy Place*, *Book Lovers*, *Funny Story*, and *Great Big Beautiful Life*. That felt current enough for my taste; I was not stranded in a high-school-curriculum time capsule. But the same results also showed repeated/variant titles, a boxed set, and “mixed floor display” products. That clutter makes the list feel less confidently curated, and a result was not stable enough to open during my attempt.

I couldn’t inspect a book page in the running UI. In source, a book page is designed to show a cover, title, linked author, rating, description, format, genres and subjects, awards, and (if saved) notes. It also has links to Open Library, Bookshop.org, WorldCat, and a configured local library. That is a useful set of details and ways to get the book, but it’s a lot of scrolling between the core reading decision and “where can I find it?”; I can’t judge the actual page’s scanability or whether a specific record has useful information.

### 2a) Work versus an edition

I did not navigate between these live. Source suggests a sensible split: a **work** groups the book’s editions and general information; **Find Your Edition** shows edition cards, and an edition with an ISBN opens the ISBN-specific book page. The edition cards expose format, publisher, and date. That’s the right underlying model for choosing paperback versus audiobook, but the terms **Work** and **Book** are not self-explanatory on their own. “Find Your Edition” helps, though I’d appreciate a one-line explanation that the work is the story and the book page is a particular format/edition. No live clarity test completed.

### 2b) Add terms and notes

I didn’t try this in the running UI. From source, editing requires saving the book first, then unlocking the edit controls. Subjects and genres can be removed or added; suggestions come from Library of Congress after typing, and typed text can also be added directly. Notes are free text and save after typing pauses. That sounds flexible, but the save-then-unlock sequence is friction before a quick note, and the lock icon may not tell me what it unlocks until I discover its label/help. I’d prefer the first save to make that next step unmistakable.

## 3) Graph view and node exploration

I saw the graph UI on the existing **/graph/subject/dragons** route. The screen showed a central *The Hobbit* node, related book/author/subject nodes, a legend, Filter, List, Share, Back, and zoom controls. The page gave a short instruction for how to use it. It has a playful, rabbit-hole vibe, and the list alternative is a welcome escape hatch if I don’t want to decode a map.

I did not tap a node, so I can’t report how responsive or satisfying the transitions felt. Source says non-center nodes recenter the same graph, the center opens its detail page, and genre/edition nodes go to their corresponding destinations. That should support exploration without piling up a stack of pages, but the number of subject labels can still make the graph feel like a data diagram rather than a quick recommendation.

### 3a) Subject-term page

I didn’t open a subject page live. Source says it can show a description, work count, broader and narrower topics, a book list, sorting options, and a graph button. That’s helpful if I’m intentionally browsing a topic; it’s less of a quick win if I just want one good next read. I’d want the list to make the most promising/current picks easy to spot, not leave me doing more catalog archaeology.

## 4) Save items and recommendations

I couldn’t save anything or view recommendations in the running UI. Source has “Save to list” controls, lets people create lists, and provides recommendations from saved books/authors and their shared subjects or authors. Recommendations can also be filtered by list. That’s a promising StoryGraph-adjacent way to build from my taste, but it seems to need saved items first; with too few seeds, the app explicitly has an “not enough books or authors” empty state. There is no obvious “here’s your next read” on the home screen in the inspected source. For me, that is the big missing quick win: I want the app to make one good suggestion before I invest in organizing a shelf.

I can’t say whether the recommendations are good—I didn’t have a saved list to test, and no recommendation results were observed.

## 5) Search for an author and access the page

My search for Emily Henry showed her name under matching books, but I didn’t get to an author page. The unstable results and disconnected app prevented me from following a book’s author link. Source shows author names on detail pages as links to an author route; that page can include a bio, pseudonyms, notable works, influences, awards, and a graph. So there appears to be a path, but I can’t confirm how discoverable or useful it feels end to end. Search itself did find the author’s books; it did not visibly present a standalone author result in the snapshot I saw.

## 6) Name

I didn’t see **Free Book Reader** in the running UI; the app currently presents itself as **Shelf Thread**. “Free Book Reader” sounds like a utility that opens free files, not a place to find a book I’ll actually want to read. Shelf Thread has a cozier, more bookstore-at-night feel, though it is a little abstract. Of my alternatives, **Next Chapter** tells me what the app is for fastest; **Booktrail** has a nice discovery vibe too.

## 7) Three favorite things

1. **Low setup cost:** search and barcode scan are the main first-screen actions in source. I like being able to just look for a book.
2. **A visual way to wander:** the graph’s categories and list alternative give the catalog a more distinctive feel than a plain search-results app.
3. **Useful ecosystem hooks:** source includes Goodreads/StoryGraph-compatible CSV export, Bookshop.org and library-search links, and local notes/tags. Those are exactly the kinds of practical details that can turn “interesting” into “on my list.”

## 8) Three least favorite things

1. **Search clutter:** the live Emily Henry results mixed relevant titles with duplicate/alternate listings, a boxed set, and floor-display products. I want fewer, better-ranked choices, not a wholesale catalog dump.
2. **The quick recommendation is not quick yet:** the source makes recommendations depend on saved items, so a new reader has to do collection work before getting a tailored pick.
3. **The app’s best actions are spread across different concepts:** Work, Book/edition, graph, subject, lists, and edit-lock are powerful, but not all instantly legible. The model may make sense after learning it; I don’t want a tutorial before a five-minute browse.

I did **not** see the previously mentioned “OL/WD” tags in this pass because the detail page never loaded. I’m not treating that past complaint as a confirmed issue in the current implementation.

## 9) New features that would interest me

Give me a **one-tap “Pick my next read”** on the first screen, with a couple of fast preference chips (romance, fantasy, fiction/nonfiction, audiobook) and no required account or list setup. A short “why this fits” would make the pick feel personal rather than random. I’d also surface export where I save books: CSV compatibility with Goodreads and StoryGraph already exists in source, but it is nested under My Library → Import & Export, and it is an export file rather than a direct account sync. Make that handoff obvious and show a success state. Bookshop.org and library links also appear to exist on book pages; I’d make availability easy to spot alongside the recommendation.

## 10) Overall

The concept has the right ingredients: discover, follow a connection, save, and get the book. The graph has personality, and the source includes the practical StoryGraph/Goodreads and library hooks I care about. But at the moment it reads more like a promising book-discovery toolkit than the effortless “here, read this next” sidekick I’d keep open between meetings. The search results I actually saw were relevant but noisy, and the runtime stopped before I could verify the most important follow-through.

## 11) Ease of use and accessibility

I could type a query into the browser search field and submit it without needing a special accessibility feature. I did not test VoiceOver, keyboard-only navigation beyond entering the query, or native iPhone accessibility. In source, controls have accessibility labels and the graph can switch to a list; screen-reader users are intended to get that list view automatically. Those are encouraging signs, not proof that the full experience works well with assistive technology.

## 12) Would I use it again?

Probably, if I wanted to follow a subject rabbit hole or look up a book and its editions. I would not yet make it my daily “what should I read tonight?” app: I want a useful pick before building a list, and I need search to feel more curated. The Goodreads/StoryGraph export and library links make me more inclined to return—but first I’d need to see them work from the book I actually chose.

## Assumptions

- Search results, labels, and page flows may vary with live catalog data, device, and saved preferences. The Emily Henry results above are the results observed in this one browser session.
- I assumed Jordan prefers romance, fantasy, contemporary fiction, and popular nonfiction because those interests are part of the assigned persona; I did not infer her actual saved library or reading history.
- Statements about detail pages, editing, work/edition navigation, subject pages, recommendations, exports, and accessibility are based on inspected source, not successful end-to-end interaction.
- I did not test an iPhone, native camera scanning, export-file download/import, external Bookshop/library links, or whether a recommendation is a good personal match.
