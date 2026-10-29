# P7 Rosa — persona-based UX review

I reviewed the running web app in a desktop browser at `localhost:8081` and inspected the relevant source. The UI was already running when I arrived. A brief attempt to start separate local services found the app/API ports already occupied; I stopped only my own failed server watcher and used the existing UI. I searched for *The Giver*, opened its work page and an edition, followed Lois Lowry to her author page, explored the graph by selecting Lois Lowry and *Number the Stars*, and opened the Fiction subject page. I did not save anything, edit notes or terms, or use the camera: those actions could change the existing local library. I did not test a physical Chromebook, Android phone, or screen reader.

## 1) First impressions; mobile or desktop?

The bookish styling feels calm and readable, and the details I could inspect have the kind of catalog information I care about. But my first stop, `/`, showed a page headed “connection (1)” asking “Connect this item to…” rather than the Shelf Thread home/search screen. That is a serious first impression, not a small matter of taste.

For my library work, I would choose the desktop/Chromebook view: comparing editions, subjects, call numbers, and catalog links is easier with room to read. A phone would be handy for scanning a donation stack. I only interacted with the desktop web UI, though; I did not compare real devices.

## 2) Search for a book and describe its page

I searched for *The Giver*. The browser had the search mode set to Author, so that query initially returned no books; switching to Title returned Lois Lowry’s *The Giver* first, followed by other titles. The work page showed a useful synopsis, a 4.0 rating with 3,145 ratings, 49 editions, subjects, an award, and more by the author. Its subject section initially showed five headings and offered “Show all 36 subjects.”

The edition list is useful for distinguishing printings, but many cards had no cover. I opened the HMH edition with ISBN `9780544157880`. Its page said “Book,” showed “hardcover” and LOC/Dewey numbers, but its About text read “Source title: The Giver (Graphic Novel) (1) (Giver Quartet)” twice. That is the sort of record detail I would verify before making a weeding or purchasing decision; a title match alone is not enough.

The visible subject chips are useful starting points, but the page does not tell me which individual heading came from LC, Wikidata, or Open Library, nor expose an authority-record link beside each heading. The book page does offer a link to the LOC catalog when an LOC record is present, and it showed this book’s LC call number and Dewey number.

### 2a) Work versus an edition

The distinction mostly makes sense to me: the “Work” page is the shared intellectual work with its subjects and edition list, while the ISBN page is one specific book/printing. In cataloging terms, I would label that second page “Edition” (or otherwise make the ISBN/edition relationship explicit), not just “Book.” I navigated from the work’s “Find Your Edition” carousel to the ISBN page; I did not test the return link. The carousel shows format, publisher, and date where available; the opened page did not make its ISBN or publication details equally prominent in the visible content.

### 2b) Add terms and notes

I did not actually add a term or note, because the running browser has a local saved library and I did not want to leave a review record in it. Source inspection shows that editing is locked until the book is saved to a list. Then the lock opens genre/subject editing; the subject field can suggest LC terms, and notes are stored on the saved record. This is a sensible guard against losing edits, but it is one extra step for a librarian who is simply correcting a record. The displayed chips do not show the source/provenance of each term.

## 3) Graph view

I opened the graph for *The Giver* and selected Lois Lowry, then *Number the Stars*. Each selection recentered the graph without sending me through a stack of new pages, and a Back control returned to the previous center. The node descriptions and relation words help explain why things are connected. The “List” option is also a practical alternative when the circles are crowded.

The graph showed overlapping-looking headings—for example, “Social Control” and “Social Control -- Comic Books, Strips, Etc,” as well as “Control (Psychology)” and its longer qualified form. Those may be distinct source headings, so I would not merge them just by eye; I do want to see their authority sources and identifiers before deciding. The relationship labels and long subject labels also make the graph busy.

### 3a) Subject page

I selected Fiction and opened its subject page. It reported 666,327 works, showed Literature as a broader topic, and offered narrower topics such as Novels in Verse, Fan Fiction, and Steampunk Fiction. That is helpful for browsing, but Fiction is far too broad to be a useful selection list on its own. I also followed “Control (Psychology) -- Comic Books, Strips, Etc” from *The Giver*; its subject page showed 0 works, and its graph said there were no linked connections. A heading attached to a book should not leave a student or librarian at a dead end without an explanation.

## 4) Lists and recommendations

I did not save a book or inspect the running browser’s existing recommendations, so I cannot say whether I found a good recommendation. From the implementation, recommendations are generated from saved items and grouped by shared authors or subjects; list data are stored on-device. Lists can be exported as CSV or JSON, but I did not find a share control on the list-detail page. For a book club, a file export is not the same as a shareable “Grade 7 sci-fi” list that families can open.

## 5) Author search and page

Searching “Lois Lowry” in Author mode returned her works, rather than a standalone author result. I opened her from the author link on *The Giver* and reached an author page with dates, a biography, and works including *Number the Stars*, *Gathering Blue*, and *Messenger (The Giver #3)*. That is useful, and the series clue in the title is welcome. The biography includes a raw citation marker and URL in its text, which looks less polished than an authority-record display.

## 6) “Free Book Reader” name

The running UI called itself **Shelf Thread**, not Free Book Reader. I prefer Shelf Thread: it suggests following relationships among books and subjects. “Free Book Reader” sounds like an ebook-reading service, which is not what I found.

## 7) Three favorite things

1. The work/edition structure and edition carousel—important when the copy a school owns is not the same edition a student searched for.
2. The practical library-finding area: LOC call number, Dewey, WorldCat, LOC catalog, and configurable links to a local catalog.
3. Subject browsing and graph connections. There is real discovery value here when headings and links are accurate.

## 8) Three least favorite things

1. `/` opened the connection screen rather than the home screen in the running checkout.
2. The subject chips and graph do not show per-heading provenance or authority identifiers, even though the data model tracks sources. The zero-work subject result makes that omission more consequential.
3. Edition information needs clearer labeling and quality checks: the ISBN page said “Book,” and the edition I opened showed a duplicated source-title string referring to a graphic novel.

## 9) New features that would interest me

- Show each term’s source and authority link—LC Subject Headings/authority URI, Wikidata item, or Open Library—and let me inspect provenance without hiding it from professional users.
- Make lists shareable with students and families through an explicit, privacy-conscious link or export flow. Let me choose whether a list is private or shared; do not silently sync student reading data.
- Add batch intake tools for donations and new arrivals: scan a stack, tag it, and support a deliberate keep/weed/review decision. The app already has multi-book scanning in its implementation, but I did not test the camera.
- Add reading-level and age-range information and optional filters so I can prepare age-appropriate recommendations without suppressing books by default.
- Make it easier to distinguish legitimate related headings from duplicates or bad merges, and to report a questionable match.

## 10) Overall

There is a useful book-discovery tool here, and I appreciate that catalog data are treated as information rather than clutter. It is not yet a substitute for my catalog or authority file: I need reliable work/edition distinctions, visible provenance, and dependable subject navigation before I use it to support weeding or challenged-book requests. I would be glad to use it as a supplementary discovery layer once those record-trust issues are addressed.

## 11) Ease of use and accessibility

Once I opened Search directly, searching and opening records were straightforward. The title/author/subject modes are tucked under Filters, and the stored Author mode made my first title query look like a failed search. The graph provides a list alternative, and its nodes have accessible descriptions in the web UI. I did not use a screen reader, keyboard-only navigation, or Android accessibility settings, so I cannot report how TalkBack or Chromebook assistive technology worked in practice.

## 12) Would I use this app again?

Yes, as a discovery and catalog-linking aid—especially for finding related titles and checking where a particular edition might be found. I would verify suspect headings and edition records in the source catalog before relying on them for collection decisions.

## Assumptions

- The search mode I encountered was persisted in the already-running browser; I restored it to Author after testing Title. The source’s fresh default is Title, so I do not assume every new user sees Author mode.
- The initial `/` behavior was observed in this checkout, where `apps/app/app/connection (1).tsx` is an untracked duplicate route file. It may explain the routing anomaly, but I did not change or remove it and cannot say whether it affects a clean release build.
- Search results, subject counts, ratings, and source records are live catalog data and may change. My conclusions about them describe this review session, not a complete audit of the catalogs.
- I did not test a real Chromebook or Android device, camera scanning, list creation/sharing, saved-item recommendations, or screen-reader behavior; comments on those features are limited to source inspection.
