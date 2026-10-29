# P10 Priya — persona-based UX review

**How I reviewed it:** I started the local backend and Expo web app and interacted with the running web UI: searched for *Atomic Habits*, opened its work and ISBN-specific book pages, opened the graph and a subject page, searched for James Clear, opened his author page, and viewed recommendations. I also narrowed the browser to an iPhone-sized viewport. I did not use a physical iPhone or test its camera. Other judgments below are based on the visible UI and inspected implementation.

## 1) First impressions; mobile or desktop?

I like that the home screen is meant to get me straight to scanning or searching, not make me browse a bunch of menus first. On the narrow web viewport, the search results and controls still fit without a desktop-style sprawl. For me, the mobile layout is the more useful one: my reading time is usually one-handed and short. I can't honestly compare a native iPhone experience with desktop because I only ran the web app. The header's My Library and New Search controls sit high on the narrow screen, though, so they're not the easiest thumb targets.

When I first opened `/` in the local web app, it showed a “Connect this item to…” screen rather than the expected home/search screen. I used direct search URLs for the rest of the review; I can't tell whether that first screen reflected local route state or a startup issue.

## 2) Find a book; experience and information

I searched for *Atomic Habits* and found James Clear's book. The search mode was initially “Title”; changing it to “Author” made a search for James Clear return his books. The book page gave me the title, author, rating, and five visible subjects, with a “Show all 11 subjects” control. It also offered Open Library, Bookshop.org, and WorldCat links. That is a useful quick answer to “is this the book, and where can I find it?”

The work page had more to explore: a description, 37 editions, subjects, more by the author, and reviews. It was also a lot to scroll through for a ten-minute reading break. I saw the same description paragraph twice on that page, which made it feel even longer.

### 2a) Work versus edition

I could see the practical distinction: the work page gathers the shared title and its editions; an ISBN-specific page is for one book/edition and includes finding links. But “Work” and “Book” are technical labels, and the book page did not make its particular edition especially prominent. The work page's edition list does show format, publisher, and date, which helps when choosing among versions. I would understand it more quickly if the app simply said “All editions” and “This edition.”

### 2b) Add terms and notes

The detail page has an “Edit genres, subjects and notes” control, but the book was not yet saved, and I did not complete an edit. Saving opens a “Choose a list” sheet with a Done step; the browser already had a list unrelated to my reading, so I did not add this book to it. The editor implementation confirms that notes and editable genres/subjects belong to a saved record. I could not verify the completed add-and-save flow without changing that existing list.

## 3) Graph view

I opened the graph for *Atomic Habits*. It showed the book connected to James Clear, subjects such as Habit and Business, and editions, with a legend plus Filter, List, Share, and zoom controls. The app explains that tapping a circle moves the graph and tapping the center opens its page. I tried the Habit node in the web view, but it did not visibly recenter for me, so I can't report a successful node-to-node exploration. The list alternative and descriptive node labels are helpful, especially if the picture gets crowded; the graph itself feels like extra homework when I'm short on time.

### 3a) Subject page

I opened the Habit subject page. It showed 392 works, broader and narrower topics, and book ordering options (“Most read,” “Top rated,” “Newest,” “Classic”). That structure is helpful. *Atomic Habits* and *The Power of Habit* appeared near the top, which is promising for my nonfiction tastes. The same list also included children's books and fiction, so a broad subject doesn't reliably keep the results focused on nonfiction.

## 4) Save items and recommendations

The Save to list button opens a sheet where I choose a list and then press Done; I don't see a one-tap save on this flow. Recommendations were available, but this browser already had an unrelated fantasy list. It produced “More by Tui T. Sutherland (8),” which is sensible for that list but tells me nothing about what Priya would get from saving biographies, business, or self-help. I did not change the existing list to manufacture a personalized result.

## 5) Search for an author

Searching “James Clear” in author mode found his books, not an author result at the top level. I could get to his page by opening *Atomic Habits* and tapping his name. The author page was easy to reach and showed his works and an Open Library link, but I saw no biography or dates for him. The works list is useful; I wanted a little more context before deciding whether to follow an author.

## 6) App name

The running app calls itself **Shelf Thread**, not Free Book Reader. “Free Book Reader” sounds generic and makes me expect an e-reader. Shelf Thread hints at connections between books, which fits the graph, but it is not immediately about saving my next read. I still like my earlier suggestion, **Next Chapter**: warm, quick to understand, and about what I need.

## 7) Three favorite things

1. I can search by title, author, or subject, and the live search found *Atomic Habits* once I used the right mode.
2. The book page gives me Bookshop.org and WorldCat links, plus a place to configure my own library.
3. There is a real batch-scan flow and CSV export in the implementation—both are useful for my crowded shelf and my existing book list.

## 8) Three least favorite things

1. Saving takes a list sheet and a Done step, rather than a quick save-for-later tap.
2. The work page is long, with 37 editions, many subjects, and (in my view) a repeated description. I need the useful nonfiction details first, not another research project.
3. “James Clear” search leads to a list of books rather than an obvious author card, and the author page I reached had no biography. The subject results also mixed nonfiction with unrelated children's books and fiction.

## 9) New features that would interest me

Please make “save for later” the easy default, with list management available when I want it. Keep the main actions reachable by thumb. I would love nonfiction-first discovery for biography/memoir, business, self-help, and parenting, and a tiny “pick up where I left off” note or progress marker. Batch scan would be great during a nap if it stays quiet: no loud beep, with haptics optional. I also want my library's borrow link to be ready without a lot of setup.

## 10) Overall thoughts

There is a useful little book-finding tool in here: I found a title, learned about its editions and subjects, and saw ways to buy or borrow it. But the current experience asks me to make several decisions—search mode, which work or edition, which list, then Done—before I have the simple saved list I came for. For my ten-minute windows, quick and calm beats an impressive amount of book data.

## 11) Ease of use and accessibility

Searching and opening a result were manageable in the web UI. Filters are tucked behind a button, and the saving/editing path takes more attention than I have when holding a baby. I did not use a screen reader, VoiceOver, or other accessibility feature, and cannot speak to how they work on an iPhone. The inspected implementation does provide accessible names for controls and a list alternative to the graph, which are encouraging.

## 12) Would I use it again?

Yes, especially to scan a shelf or look up a book's library link. I'd be more likely to keep using it if saving were quicker and the nonfiction recommendations felt like they understood what I read.

## Assumptions

- I treated the local browser's existing saved list as unrelated test data, not Priya's reading history; recommendations from it are not evidence of her personalized results.
- Search results, ratings, and book details came from the running app and its available catalog services, so they may differ later or by edition.
- The narrow viewport was a browser simulation, not a native iPhone test. I did not grant camera permission or scan an actual barcode.
- I did not add the reviewed book to the existing list or persist any term or note edits.
