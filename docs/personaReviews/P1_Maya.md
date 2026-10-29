# P1 Maya — UX review

I ran the local backend and Expo web app and interacted with the browser UI: I searched for “Wings of Fire,” opened *The Dragonet Prophecy*, followed an edition, explored graph nodes and the Dragons subject page, searched for Tui Sutherland, and saved/edited a book in a list. I also checked the web layout at 390 × 844 pixels. I did not use a native iPhone.

One thing first: the initial `/` page showed “Connect this item to…” instead of the home screen. The local tree contains an untracked `apps/app/app/connection (1).tsx`, and Expo’s sitemap showed that file mapped to `/` alongside `index.tsx`. I left it untouched and navigated directly to search. That may be specific to this local checkout.

## 1) First impressions; mobile or desktop?

The working screens look pretty, kind of grown-up, and very bookish. I like the covers and the big readable titles. The dark background with green buttons looks polished, but maybe a little serious for me. At phone width, the book rows still fit nicely. I’d pick mobile because I’d use it at the library, though I only tested a mobile-sized web view—not an iPhone app.

## 2) Find a book and describe its page

I searched “Wings of Fire” and did find the series, but the first result was *Wings of Fire* by A. P. J. Abdul Kalam, not the dragons. *The Dragonet Prophecy* was right below it. Covers helped me spot the one I meant.

Its page showed a 3.9 rating from 135 ratings, an About section, subjects, editions, reviews, and “More by this author.” That’s useful stuff. The About text was kind of a mess, though: the same long, awkwardly worded description appeared twice. I’d look at the rating and cover first, not read all that.

### 2a) Work versus an edition

The Work page had “Find Your Edition” with publisher, year, and format cards. I tapped one and landed on a page labelled “Book,” with a back link to “Work.” I get that one is the general story and the other is a particular copy, but “Work” and “Book” don’t explain that by themselves. I also didn’t see the series number on either page for this title.

### 2b) Add terms and notes

I could add them, but first I had to save the book to a list. I made a list, selected it, then unlocked editing. After that I added “Dragon Adventures” as a genre and wrote a note. Locking the page saved them, and both showed up. It worked, but the save-first step was a little surprise.

## 3) Graph view

The graph says to tap a circle to move there, and it has a list option, filters, and zoom controls. I tapped Dragons, then The Hobbit; the center changed without making me start over. Tapping the centered node opened its page. That’s fun to poke around in, but the graph can lead to books I’m not looking for, like *The Hobbit* and *A Game of Thrones* from Dragons.

### 3a) Subject page

The Dragons page showed 4,181 works, broader and narrower topics, and sort buttons for Most read, Top rated, Newest, and Classic. It had newer fantasy too, including *Iron Flame* and *The Dragonet Prophecy*, which is good. But the first “Most read” books included *A Game of Thrones* and *The Hobbit*, so the topic is broad and I’d still ask someone which ones are right for me. There wasn’t a short explanation of what “Dragons” means as a subject.

## 4) Lists and recommendations

I saved *The Dragonet Prophecy* to “Maya’s Fantasy Stack.” The recommendations appeared under “More by Tui T. Sutherland (8)” and included *Darkstalker*, *Escaping Peril*, and *Moon Rising*. Those are actually interesting to me. They were grouped as more by the author, though, not in series order, and I didn’t get a clear “book 2 next” clue.

## 5) Author search and page

I switched search to Author, searched Tui Sutherland, opened a result, and tapped the author’s name. I got to an author page. It had no biography and said there was no Wikidata match; it showed just three works. So yes, I could get there, but it felt kind of empty and didn’t show the whole series.

## 6) “Free Book Reader” name

The app I saw is called **Shelf Thread**, not Free Book Reader. I like Shelf Thread better: it sounds like following connections between books. **Book Trails** is even easier to understand right away. “Free Book Reader” makes me think I can read ebooks in the app.

## 7) Three favorite things

1. Covers show up beside search results and book lists, so I can spot a book fast.
2. The rating is easy to find, and I can browse editions and books by the author.
3. I could make a list with my own name for it and get real Wings of Fire-related suggestions.

## 8) Three least favorite things

1. The first “Wings of Fire” result was a different book, so the search started with a false alarm.
2. I didn’t find series order or a number for *The Dragonet Prophecy*; “More by this author” isn’t the same as “read this next.”
3. Some descriptions are long and repeated, and broad subject pages mix newer fantasy with older, popular titles I might not be looking for.

## 9) New features that would interest me

Please show the series number right on results and book pages, and let me sort a series in order. Let me decorate a want-to-read list with covers or colors so it’s fun to show my parents. I also want batch scanning for my library stack. I spotted a “Scan multiple” control in the scan-screen source, but I didn’t test the camera, so I can’t say how it works. A parent-friendly content filter could be useful too, as long as it doesn’t hide books by default.

## 10) Overall

It’s pretty and I’d lowkey use it to pick out books, especially when I already know a title or author. The covers, rating, and lists make sense to me. I’d trust it more if it showed series order and made the recommendations feel less like a giant catalog.

## 11) Ease of use and accessibility

Searching and opening a book were easy once I got to the search page. I didn’t need an accessibility feature in this browser test, and I didn’t test VoiceOver or parental controls. The graph’s list view seems helpful if tapping circles is hard. At phone width, the text and buttons looked comfortable to read and tap.

## 12) Would I use it again?

Yeah, especially before checkout or to show my parents what I want to read. I’d still check with my parent or librarian about what to read next if the app can’t tell me the series order.

## Assumptions

- The 390 × 844 browser view is only an approximation of my iPhone; I did not test a native iPhone, camera permission, or barcode scan.
- I tested one book, one author, and the Dragons subject. Results and source-provided descriptions can change, and I’m judging the data shown in this session.
- The initial home-screen mismatch may be caused by the untracked duplicate route in this checkout; I did not edit or remove it and don’t assume it is part of the intended release.
- “Free Book Reader” may refer to an older app name; the current web UI and page title showed Shelf Thread.
