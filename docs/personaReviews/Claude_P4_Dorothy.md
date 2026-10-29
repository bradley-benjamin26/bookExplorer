# Persona review: P4 Dorothy (68, retired teacher, two book clubs)

## Review basis

I used the local web build (Expo web on :8099, backend on :3001) through Playwright. I tested at phone size (390x844), in an iPad-sized window (820x1180), and at desktop size (1280x900). I tried both light and dark themes, and I set page zoom to 175% to stand in for large text.

What I did in the UI:
- searched for *The Nightingale* (Kristin Hannah) and *All the Light We Cannot See*
- opened the work page and an edition (book) page
- saved a paperback edition to a new list called "Library Book Club"
- unlocked editing, added the subject "Sisters", wrote and saved a book-club note, and checked that the note came back after a reload
- opened the graph and tapped the author node
- opened the subject page "Civilians in War"
- saved *Still Life* (Louise Penny) and opened Louise Penny's author page
- looked at Recommendations, Lists and Settings, including "Add new library"

What I could not test:
- **Camera scanning:** this was a desktop browser.
- **Text size:** I had no real iPad or iPhone, so I could not use iOS Dynamic Type. Browser zoom was the closest substitute.
- **Home page:** "/" showed a stray "Connect this item to…" screen because of an untracked file in the working tree, so I never saw the home page or its "Scan a book" button. I started at /search instead.
- **Sharing:** I did not test the share buttons.

Test-setup note: the web build calls api.shelfthread.com, and that address blocks localhost (CORS). I rerouted those requests to the local backend. Some pages took several seconds to load because the backend was shared with another tester.

## 1) Initial impressions; mobile or desktop?

It is a handsome page. The cream background, the serif headings and the large book covers feel like a good library, and the about text on *The Nightingale* was right near the top, which I appreciated. Some things puzzled me at once, though:
- The two icons at the top right (a little row of book spines and a magnifying glass) have no words under them. I had to guess that the spines meant "my books."
- The search box says "Search by title," but the line just below it says I may search by title *or* author. Which is it?
- The "Language (" box under Filters is cut off.

I prefer the **mobile/iPad view**. On my iPad-sized screen the text was a comfortable size and the page filled the screen. On the large computer screen everything is squeezed into a narrow strip down the middle, and the writing comes out *smaller* than on the iPad, with empty beige space on both sides. That is backwards for me.

## 2) Search for a book; the book page

I searched for "The Nightingale Kristin Hannah," and the right book came first. Good. Below it, though, was a long run of "Summary of the Nightingale," "Trivia" and "Study Guide" booklets, which are clutter.

When I tried "All the Light We Cannot See," the first result was by someone called **"Brainy Books,"** not Anthony Doerr. It had no cover and only one edition, and its "More by this author" was *How to Win Friends and Influence People*. I would have saved the wrong book without realizing it. A retry with the author's name added came back with nothing in the time I waited, possibly because the shared test server was slow.

The work page for *The Nightingale* is genuinely helpful:
- an **About** paragraph near the top
- a star rating
- the cover
- "More by this author"

What I didn't find helpful:
- **"Find Connection"**: what does it do? A big green button with no explanation. A small hover note on the computer read "Find how this book links to another," but I won't see hover notes on my iPad.
- The **Subjects** list includes "World War (1939-1945) Fast (OCoLC)Fst01180924" and "FICTION / Contemporary Women." That is librarian shorthand, and to me it looks like a mistake.
- **"Find Your Edition (37)"** opens with two Spanish editions ("El Ruiseñor") and nothing says what language they are in.
- I saw no **series** information for *The Nightingale*. There may simply be none, but for a Louise Penny mystery I most need "which one comes first?" and I could not find a reading order.

## 2a) Work vs. edition

The heading at the top changes from "Work" to "Book." I have to say "Work" means nothing to me: my books are books. The edition page did have something better: a plainer, shorter summary marked "via Wikipedia," a "Format: Paperback" line, and "Find This Book" links to Open Library, Bookshop.org and WorldCat. I suppose the idea is "the story" versus "the copy on my shelf." That would make sense if someone told me so, but the app never does.

Being *forced* to choose an edition is where I would stumble. When I pressed "Save to list," I was shown a list of 37 editions, Spanish and Polish ones first, with ISBN numbers. There is a "Save the work instead" link, but it sits at the very bottom of the list. A Center Point **Large Print** edition is in there, which I would love, but nothing marks it as large print except the publisher's name.

## 2b) Adding terms and notes

This works, but I would never have found it alone. The way to add notes is a **small padlock icon** next to "Save to list," with no word beside it. A padlock tells me "locked, keep out," not "write your notes here." When I tapped it, the app asked me to save the book to a list first and to choose an edition, then a list, and only then would it let me edit.

Once I was in:
- **Subjects:** I typed "Sisters," and a helpful list of suggestions appeared. Pressing Enter added it, and "Sisters" later showed up in the graph.
- **Notes:** the box was large and clear. I wrote "Library club, Nov. 12. Question for group: was Vianne braver than Isabelle?"

There is no "Save" button for the note. You save by tapping the padlock again, and I would have been worried my note was lost. It *was* saved: after a reload, a "Your Notes" section showed it. That pleased me very much.

Two things troubled me in editing mode:
- All 50 subjects appeared, many in Spanish ("Guerra Mundial II," "Hermanas," "OcupacióN Alemana," with that odd capital N), each with a little "×." That is a lot of things I could break.
- Several long subject pills ran off the right edge of my phone screen.

## 3) Graph view

The page explains itself in one plain sentence, "Each circle is a book, author or subject…," and the colour key is a kind touch. Tapping Kristin Hannah's circle brought up all her novels around her, and a "Back" button appeared. That part was clear.

But the writing under the circles is **tiny**, far smaller than anything else in the app, and the "OCoLC" label is there again. On a phone, the top half of the graph area was empty space. It is pretty to look at, but I would not use it for my book club. I would rather have the same things as a plain list. I did see a "List" button and would try that, but I'd prefer the graph were not one of the two big green buttons on every book page.

## 3a) Subject page

"Civilians in War" was a pleasant page:
- a title and "234 works"
- a "Broader topics: War" link
- tabs labelled "Most read / Top rated / Newest / Classic," which are plain words
- a list of books with covers

*The Silver Sword* was there, which I used to read with my fourth graders. This page could actually help me suggest a next pick to my club. Some titles are in Albanian or Italian, but it is otherwise useful.

## 4) Lists and recommendations

Creating a list was easy: "Create new list," "Name (required)," "Create and add." Having both "Create and add" and a separate "Done" button made me wonder whether I'd pressed the right one. The list page showed my books.

It also showed **"Export CSV"** and **"Export JSON"** buttons next to "Delete list." I don't know what those are, and having them beside a red-sounding "Delete list" makes me nervous.

With only *The Nightingale* saved, recommendations were just "More by Kristin Hannah," which was fine. After I added *Still Life*, the top group became "Because you like Fiction," and its first suggestion was **Fifty Shades of Grey**, followed by *The Hunger Games*, *A Court of Mist and Fury*, *Diary of a Wimpy Kid* and *Harry Potter*. I would be mortified to bring the first one to my church group, and none of the others is what a historical-fiction or mystery reader wants.

"More by Louise Penny" was useful. "Because you like Large type books" is an odd reason to recommend anything. Overall, the only good recommendations were the "more by this author" ones.

## 5) Author page

There is no "author" result in search. Even with the "Author" filter chosen, I got a list of books. I reached Louise Penny's page by tapping her name, which is underlined, on a book page.

The author page is lovely:
- a photo
- an About paragraph saying she is a Canadian crime writer known for the Inspector Gamache series set in Quebec
- her works
- "Notable Works"
- a list of awards (Agatha, Anthony, Order of Canada)

That is exactly what I want before a meeting. Three things let it down:
- The awards list repeats "Anthony Award for Best Novel" five times with no years.
- The works are not in series order, so I still can't tell which Gamache book comes second.
- There was another "Find Connection" button I didn't understand.

## 6) Light vs. dark

**Light ("Standard")** is my preference. It is calm and cream-coloured like paper, and the dark green buttons are easy to see. The pink and rust-coloured pills are a little busy.

**Dark** looked better than I expected:
- The main text is a soft white and easy to read.
- The genre and subject pills keep their colours.
- The graph circles are brighter.

The grey secondary text (publisher names, "(1,003 ratings…)") is dimmer, and at night I would strain. I'm glad the choice sits in Settings under "Appearance," with plain words ("System / Standard / Dark").

## 7) Three favourites

1. **The About summary near the top** of book and author pages, sometimes from Wikipedia.
2. **Notes that are kept.** My club question was still there when I came back.
3. **A calm, bookish look**, with big covers and clear headings on the iPad.

## 8) Three least favourites

1. **The padlock for notes.** It is a hidden, unlabelled icon, there is no Save button, and you are forced through edition and list choices first.
2. **Librarian jargon and foreign-language clutter**: "OCoLC Fst…," "Work," "Find Connection," "Export JSON," Spanish subjects and editions shown first.
3. **Unreliable results**: a knock-off "Brainy Books" listed as the author of a famous novel, and *Fifty Shades of Grey* at the top of my recommendations.

## 9) New features I'd like

- A **"Series in order"** section ("Book 1 of 19 in the Three Pines series").
- A **"Book club" notes page** that I can share or print for the group, plus a place for discussion questions and the meeting date.
- **A text-size setting** inside the app, or at least a desktop view that grows with the screen.
- A **"Show English editions only"** choice, and labels for large-print editions.
- **Help setting up my library.** The "Add new library" box asks me to copy "the address of the results page" and mentions "{isbn}." My grandson would have to do that. A list of nearby libraries to pick from would be far kinder.
- Words under the top-right icons ("My books," "Search").

## 10) Overall

It is a pretty, peaceful app, and when it gets things right, as with *The Nightingale* summary, Louise Penny's biography and my saved note, it is just what I need for book club. But too often it talks like a librarian or a programmer. The most important thing for me, writing notes, is hidden behind a padlock, and the suggestions embarrassed me. I never saw anything about subscriptions or payments, which I was glad of.

## 11) Easy to use? Accessibility

Moderately. Searching, reading a book page and making a list were easy. Notes and the edition chooser were not.

I found no text-size setting in the app. Zooming the page to 175% worked well: the text grew and wrapped properly without running off the screen. The graph labels stayed small relative to everything else, and some subject pills overflowed even at normal size. I could not test iPhone or iPad text-size settings.

## 12) Would I use it again?

Yes, for looking up a book and its author before a meeting, and for keeping my notes, now that someone has shown me the padlock. I would not use the graph or the recommendations, and I'd want the series order before I relied on it for my mystery club.

## Assumptions outside the persona

- I chose *The Nightingale*, *All the Light We Cannot See* and Louise Penny's *Still Life* as titles a historical-fiction and mystery reader in two book clubs would pick.
- I assumed Dorothy would choose an English paperback edition and ignore the Spanish ones listed first.
- I used 175% browser zoom as a stand-in for her iPad text-size setting.
- I assumed Dorothy would find *Fifty Shades of Grey* unsuitable to bring to a church book club. The persona says only that she belongs to one.
- I assumed she would not see hover tooltips because she uses touch devices.
- I wrote "Book 1 of 19 in the Three Pines series" as an example of what a series section could say. I did not check the real number of books in the series.
