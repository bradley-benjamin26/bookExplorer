# P8 — Alejandro

I reviewed the running app in a local web browser, first at desktop size and then in a 390 × 844 mobile-sized viewport. I searched, opened a work and author page, and explored the graph and a subject page. I did **not** use a physical Android phone. Where I did not perform an action, I say so and base the answer on the inspected implementation.

## 1) First impressions; mobile or desktop?

It looks inviting, and the search and “Scan a book” actions are easy to spot. I prefer the mobile-sized view for quickly checking a book when I am away from home; the layout fit the narrow viewport. But the large book cover and edition carousel take up a lot of that small screen. For exploring the graph, I would rather have a desktop screen. This was a browser resized to phone dimensions, not a test on my Android phone.

## 2) Search for an interesting book; book-page experience

I searched for *Cien años de soledad*, then tried *Cien anos de soledad* without the accent. Both searches returned Spanish-titled matches, including Gabriel García Márquez. That was a good surprise: for these queries, the search handled the missing accent. Opening the first result took me to its work page, titled *One Hundred Years of Solitude*. The page showed its author, rating, graph actions, and 45 editions. The English title after choosing the Spanish result made me pause to check I had opened the right work.

There is useful book information and a clear way to keep exploring, but the English emphasis remains. The search interface and filter labels are English. In the server, `englishOrNull` is used on book/work descriptions and summaries; Spanish descriptions can therefore be omitted even though Spanish titles still appear in search. (Search implementation: `apps/app/app/search.tsx`, `apps/app/src/storage/searchFilters.ts`; description filtering: `apps/server/src/language.ts` and the book/work services.)

### 2a) Work versus edition

The distinction mostly makes sense: the work page gathers editions, and each edition card shows a format, publisher, and date. I saw the “Find Your Edition (45)” carousel, but I did **not** open an individual edition. The implementation routes ISBN-bearing edition cards to an ISBN-specific book page; the work is the shared record and the book page is for one edition.

For me, the hard part is choosing the Spanish one. The cards I saw did not say what language an edition is in, and the shared `Edition` data type has no language field. A cover and publisher name are not a reliable language label. (See `apps/app/src/components/EditionsSection.tsx` and `packages/shared/src/index.ts`.)

### 2b) Add terms and notes

I did **not** save a test book or enter notes, because that would write to the app’s persistent local library. From the implementation, I need to save the book first; then I can unlock editing for subjects/genres and add notes. Notes save after a brief pause or when the field loses focus. That flow is understandable, but it is an extra step before I can write anything. (`apps/app/app/book/[isbn].tsx`, `apps/app/src/components/TermsSection.tsx`, `apps/app/src/components/SavedRecordEditor.tsx`.)

## 3) Graph view

I opened the graph for *One Hundred Years of Solitude*. Its instructions say to tap a circle to move there; I tapped “Spanish Language Books,” and the graph recentered on that subject. Filter, list, share, zoom, and reset controls were visible. The graph’s list view is a welcome alternative to the visual map, especially on a small screen. Some nodes and relationship labels are English, though, and the work itself was shown with its English title. I did not measure graph data use or performance on a budget Android phone.

### 3a) Subject page

I tapped the centered “Spanish Language Books” node to open its page. It showed 588 works, sort choices, and relevant Spanish titles such as *Crónica de una muerte anunciada*, *La casa de los espíritus*, and *Ficciones*. That is helpful for browsing from my reading interests. The list also included English-titled works such as *Treasure Island* and *Don't Let the Pigeon Drive the Bus!*; a subject label alone does not tell me which edition is actually in Spanish. The page labels and sort controls are in English.

## 4) Lists and recommendations

I did **not** add items to a list or inspect generated recommendations, to avoid writing test entries into persistent app storage. From source, recommendations use saved books’ subjects and authors, group suggestions by what they share, and allow filtering by list. That sounds useful for finding another read, but I cannot say whether I found a good recommendation or whether it will find the same book in Spanish for me and English for my kids. (`apps/app/app/recommendations.tsx`, `apps/app/src/components/RecommendationsSection.tsx`.)

## 5) Search for an author and open the page

Searching for “Gabriel García Márquez” in Author mode returned his works, including several Spanish titles. I opened a work and tapped his name to reach the author page. So I could get there, although the author search itself led to books rather than directly to an author result. The page showed his dates and biography, but the biography was in English; the works list was more useful to me.

## 6) The name “Free Book Reader”

The app I saw is called **Shelf Thread**, not “Free Book Reader.” I prefer Shelf Thread: “Free Book Reader” would make me expect that I can read or download free books here. Shelf Thread is more honest about discovering books and connections, though it is an English name. A Spanish tagline alongside it—something like “Libros y conexiones”—would help me understand it right away.

## 7) Three favorite things

1. Spanish titles appeared in search, and my two test searches worked with and without the accent.
2. The work page connects a title to many editions, while the author and subject pages give me other paths into Spanish-language reading.
3. I can explore connections in a graph or switch to a list; I like having both ways to browse.

## 8) Three least favorite things

1. The interface, graph labels, and author biography speak mostly to English readers. Spanish books are findable, but the app does not feel Spanish-first.
2. The edition cards do not label language. With 45 editions, I cannot quickly tell which one is Spanish, English, or another translation.
3. Covers appear in search/detail and edition views, and saving a book automatically prefetches its cover. Saved item details are also prefetched for offline use. I found no data-saver setting or control to keep those downloads to Wi-Fi. I did not measure the actual data transferred, but on prepaid data I want that choice before images load.

## 9) Features I would like

- A Spanish interface and a saved Spanish-first search preference, with an easy language filter that says “Spanish” rather than asking me to enter a code.
- Language labels on editions, plus links both ways between the same work in Spanish and English, so I can read one version and help my children find the other.
- A data-saver mode: text-first results, optional covers, and downloads only on Wi-Fi or when I explicitly ask. Let me keep selected book details available offline for the library.
- A way to mark a work as useful for shared family reading while keeping each child’s English edition and my Spanish edition connected.

## 10) Overall

I would call it promising for me: Spanish-language works are present, accented and unaccented title searches both worked in my test, and the author/subject paths make browsing enjoyable. But it still talks mainly to English readers, and I cannot confidently choose a Spanish edition from the carousel. On my prepaid plan I also need more control over covers and offline downloads.

## 11) Ease of use and accessibility

The search and graph controls were straightforward in the browser, and I did not need an accessibility feature during this review. The source gives controls accessible labels and roles, and the graph can switch to a list; it also opens that list when a screen reader is detected. I did not test TalkBack, Android text scaling, or keyboard/screen-reader behavior on a phone, so I cannot confirm those work well on my device. English labels would still be a barrier for some Spanish-first readers.

## 12) Would I use it again?

Yes, especially on Wi-Fi at home or the library. I would use it to find Spanish titles and follow author or subject connections. I would be more comfortable using it regularly on prepaid data after I could choose which images and details download.

## Assumptions

- The live review was a local Expo web app with its local API. The catalog results reflect what the upstream source returned during this review and may change.
- A 390 × 844 browser viewport is only a rough mobile-layout check; I did not verify rendering, speed, or memory use on a three-year-old Android phone with 3 GB RAM.
- I did not measure network traffic or test offline behavior. My data-use concerns are based on the image and prefetch behavior in source, not a measured download total.
- I did not save a book, edit terms/notes, create a list, or generate recommendations, because those actions would persist test data. Those answers are based on source inspection rather than live results.
- I did not test TalkBack or other Android accessibility features.
