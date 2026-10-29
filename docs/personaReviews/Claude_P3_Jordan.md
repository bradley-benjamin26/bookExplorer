# Persona review: P3 Jordan (22, marketing coordinator, iPhone, StoryGraph user)

## Review basis

**What I actually did:** I used the local web build (Expo web on :8099 with the backend on :3001) through Playwright. I used a phone viewport (390x844) for most of it and a desktop one (1280x900) for comparison, and I looked at both light and dark themes by emulating the system color scheme. I searched for *Funny Story*, *Fourth Wing*, *A Court of Thorns and Roses*, *Tomorrow, and Tomorrow, and Tomorrow*, *Book Lovers* and *Sarah J. Maas*. I opened work and edition pages, unlocked editing and added a genre, a subject and a note, then reloaded to check they stuck. I walked the graph (book → author → another book → genre), opened three subject pages, made a list ("Commute TBR") with 5 books, looked at recommendations, exported the list as CSV and read the file, and opened the author page, Settings and Import & Export.

**What I could not test:**
- Camera scanning and a real iPhone or Safari. I used a mouse, not touch, so I saw hover tooltips a phone wouldn't show.
- The home page. "/" showed a stray "Connect this item to…" screen because of an untracked file in the working tree (a setup issue), so I started at /search.
- shelfthread.com. Cloudflare's bot check blocked automation.
- Actually importing the CSV into StoryGraph.

**Setup workaround:** the web build calls api.shelfthread.com, which rejects localhost with CORS, so I rerouted those requests to the local backend.

## 1) Initial impressions; mobile vs desktop

First 30 seconds: I landed on a nearly empty search screen (one box, "Filters", and a Wikidata badge). That's not a hook. Once real covers loaded, the vibe improved fast. The cream background, serif titles and forest-green buttons on *Funny Story* look very "indie bookstore Instagram", and I'd screenshot that page.

**Mobile wins easily.** The desktop view is just the phone column centered in a 1280px window with empty bands on both sides. It's fine, but it adds nothing. The one place desktop is better is the graph, where the node labels become readable. On the phone they're tiny.

## 2) Search, then the book page

I searched "Funny Story" and Emily Henry's book came **second**, behind *It's Kind of a Funny Story*. The rest of the page was kids' joke anthologies ("Funny Stories for 9 Year Olds"). *Fourth Wing* came up first, but its results also included Paperblanks day planners, a pen loop and a tarot deck. Search worked, but I had to skim past merch.

The work page itself is good:
- A big cover, a 4.2 rating with 965 ratings, and a real blurb.
- An edition carousel and "More by this author" with actual covers (Beach Read, Book Lovers, Happy Place).
- Pages for books the server hadn't fetched yet took about 5.7 seconds to open. Pages it had already loaded opened in about 0.3 seconds.

Helpful: the blurb, the rating, and more-by-author, which is basically my next read.

Unhelpful:
- **"LCGFT: Romance Fiction" and "LCGFT: Novels" tags.** They read like code. What is LCGFT? Nobody I know would ever say that.
- **"Reviews (5)".** One says "Paused at 78% in May of 2024" and one says "Dear Penguin UK, can you please approve me for this eARC?" Those are status updates, not reviews. StoryGraph would never.

## 2a) Work vs edition

I tapped the first edition card and went from a header that said "Work" to one that said "Book". The new page had the **same** title, cover, rating and tags, plus a Wikipedia blurb and a "Find This Book" section.
- The edition page never tells me which edition I'm on: no publisher, format or ISBN, even though the card I tapped showed them.
- The Bookshop.org and WorldCat links only appear on the edition page. Those are the links I care about most, and the main book page doesn't have them.
- The "Rom-Com" genre I added on the work page didn't show up on the edition.

So no, the distinction doesn't make sense to me. "Work" is library-speak. I want one book page with a "pick your edition" dropdown and the buy and borrow links right there.

## 2b) Adding terms and notes

Finding it: the only way in is a small padlock icon next to "Save to list". I never would have guessed a lock means "edit". When I tapped it:
- It made me **choose an edition and then a list first** ("Save this book to a list before editing…").
- In the new-list form, pressing Enter did nothing. I had to tap "Create and add".

After that, editing was nice. I got chips with an ×, "Add a genre" and "Add a subject" boxes, and a notes field. I added "Rom-com", "Summer vibes" and a note. Then I hit a trap:
- **My first attempt, which didn't tap the lock to save:** the note survived a reload but both tags were silently gone.
- **My second attempt, which did tap "Lock and save":** the tags stuck.

Other gripes:
- It also re-capitalized my tags to "Rom-Com" and "Summer Vibes".
- My own subject got hidden behind "Show all 9 subjects", while the LCGFT tags stayed on screen.

Notes autosave and tags don't. Pick one.

## 3) Graph view

It's pretty, especially in dark mode on desktop. The legend uses colored dots (Author, Book, Subject, Genre, Editions), and moving from Funny Story → Emily Henry → Book Lovers felt kind of fun. But:
- The first ring around a book is **only tags**: Novel, Fiction, Romance twice (once as a subject, once as a genre), and the LCGFT ones again. There are no other books there.
- The author ring included "Emily Henry 24-Copy Mixed Floor Display" and a "9-Copy Mixed Floor Display", which are store fixtures.
- The nodes are plain circles. Covers on the book nodes would make this screenshot-worthy.
- On the phone, the labels are about 8px.
- Tapping the purple "Romance" genre node jumped me straight to the subject page instead of re-centering the graph like the instructions said it would.

The List toggle ("14 connected to Emily Henry") is actually the more usable version on a phone. Verdict: a nice extra, not why I'd open the app.

## 3a) Subject pages

- **Romance:** 22,218 works and good sort chips (Most read / Top rated / Newest / Classic). But the "About" says "composition of Alberto Nepomuceno", which is a Brazilian composer's piece of music, not the genre. The second result was a Portuguese title. Embarrassing.
- **New York Times Bestseller:** the most useful one. It's a decent "what's popular" shelf (Atomic Habits, Love Hypothesis, ACOMAF).
- **LCGFT: Romance Fiction:** the title displays as "Lcgft: Romance Fiction" and the header says "1 works" while the page lists 2. It's a dead end.

They're useful as a browse shelf when the tag is a normal word, and useless when it's catalog code.

## 4) Lists and recommendations

Saving:
- Every save made me pick an edition first, then a list, then tap Done. That's three taps of setup each time when I just wanted to star it. There is a "default list" setting buried in Settings.
- One save looked like it didn't stick until I reopened the book. That might have been my test script, so I'm not counting it against the app.

Recommendations loaded in about 2 seconds, grouped as "Because you like American literature / Young adult fiction / fantasy / NYT bestseller / romance", plus "More by Sarah J. Maas / Emily Henry / Rebecca Yarros".
- **Good picks:** A Court of Mist and Fury, The Cruel Prince, The Love Hypothesis, Twisted Love, and the More-by-author rows.
- **Not good:** The Great Gatsby, Nineteen Eighty-Four and Charlotte's Web (filed under "fantasy"!), The Hobbit, Dune, plus Atomic Habits and *Can't Hurt Me* in the NYT row.

That's my past complaint again: half of it is **"basically my high school reading list."** It also doesn't decide for me. I get six collapsible sections of 8 instead of one "read this next" card. The "shares: fiction, New York Times bestseller…" lines explain the logic but read like debug output.

**Export:** this was the win. "Export CSV" downloaded `commute-tbr-2026-10-28.csv` on the first try, and the Import & Export page explicitly says it works with Goodreads and StoryGraph. The file is in Goodreads format and kept my note. But:
- Every row is "to-read", so my "5 stars" note doesn't become a rating.
- Because I chose "save the work", the app silently picked the first edition's ISBN. For Book Lovers and ACOTAR that's a Thorndike or Cengage Gale **large-print** edition, so StoryGraph may match the wrong edition.

## 5) Author page

- **Finding it:** searching "Sarah J. Maas", even with the **Author** filter on, only returned her books. There's no author result. I got to her page by tapping her name under a book title.
- **What's there:** a decent Wikipedia bio ("75 million copies"), "Notable Works: ACOTAR, Throne of Glass, Crescent City", and an 8-book Works list with covers.
- **What's missing:**
  - No photo.
  - "05 March 1986 – present" reads like an obituary template.
  - No series grouping or reading order, which is the one thing a Maas reader actually needs.
  - The 8 works stop at The Assassin's Blade with no "show all".

It's helpful as a quick glance and unhelpful as a guide.

## 6) Light vs dark

**Light:** warm cream with forest green. It's the confident, grown-up look I liked before, and the covers pop on it.

**Dark:** charcoal with a softer green. It's easy on the eyes at night on the train, and the graph honestly looks best in dark, with pastel nodes on black.
- Downsides: the mint-on-green button text is a bit lower contrast, and the cover shadow disappears.
- The header logo, "Shelf Thread", is small and low-key in both.

I'd use **dark** at night and light for screenshots. If I had to pick one, light: it has more personality.

## 7) Three favorite things

1. The book page looks great: big cover, rating and blurb, and "More by this author" with real covers.
2. CSV export that names StoryGraph and Goodreads and downloaded first try, notes included.
3. The New York Times Bestseller subject shelf and the More-by-author recommendations. They're actually current.

## 8) Three least favorite things

1. **Tags that read like code**, like "LCGFT: Novels" and "Lcgft: Romance Fiction · 1 works", plus junk data (floor displays, day planners, a Brazilian composer as the definition of Romance).
2. **Setup before value:** the padlock-to-edit, edition-then-list before every save, and tag edits lost unless you tap the lock again.
3. **Recommendations that feel like a syllabus** (Gatsby, 1984, Charlotte's Web) and never just pick one book for me.

## 9) Features I'd want

- A single "Your next read" card on the home screen, decided for me.
- A one-tap save to my default list (long-press to choose a list).
- Import my StoryGraph export so the recs know what I've already read.
- Real ratings and read status in the export, plus an edition picker that doesn't default to large print.
- Series order on author pages.
- Bookshop.org and Libby/library buttons on the main book page.
- Audiobook availability.
- Covers inside the graph nodes.
- A filter to hide merch and box sets.

## 10) Overall

The vibe is there: the book pages are gorgeous and the export actually works. But it still feels like a library catalog wearing a bookstore costume. Every time I relaxed, something reminded me it was built on catalog data: an LCGFT tag, a "Work" header, a padlock, a floor display. Against StoryGraph it loses on recommendations and wins only on looks and the graph novelty.

## 11) Ease of use / accessibility

It's mostly easy once you're on a book. The hard parts were the padlock (it means "edit"?), the Author filter that doesn't return authors, and Enter not submitting the new-list form. I didn't need any accessibility features. I did notice the graph labels are hard to read at phone size, and you'd need to pinch-zoom (or use the zoom buttons) to read them.

## 12) Would I use it again?

Maybe, for one specific thing: looking up a book someone mentioned, then exporting a list to StoryGraph. As a daily "what do I read next" app, no, not until the recs lead with a current pick and the LCGFT stuff is hidden. I'd give it a 6/10 vibe check and a 4/10 "would I open it on my commute".

## Assumptions outside the persona

- The conflict table uses the IDs "P3a" and "P3b". I assumed **P3a = Jordan** (hide tags, graph is a nice extra, bigger covers, distinctive name, "pick for me", current books only).
- Mouse and Chromium web stood in for Jordan's iPhone and touch, and I treated the web build as representative of the iOS app.
- I chose the books (Funny Story, Fourth Wing, ACOTAR, Book Lovers, Tomorrow x3) as typical of her stated taste. The list name and note text are mine.
- I assumed StoryGraph accepts a Goodreads-format CSV. I did not actually import it.
- Load times were measured on localhost. Pages for books the server hadn't fetched yet took about 5.7 seconds, and pages it had already loaded took about 0.3 seconds. The real site may differ.
- I didn't add a library in Settings, so I didn't see the library catalog link. Jordan wouldn't set that up in her first 10 minutes.
