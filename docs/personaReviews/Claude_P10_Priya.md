# Shelf Thread review: P10 Priya (working new parent, one-handed, nonfiction)

## Review basis

- **What I did:** I drove the local web build (http://localhost:8099) with Playwright at phone size (390x844, touch) and desktop size (1280x900), in both light and dark mode. I searched for Atomic Habits, Shoe Dog, Becoming, The Power of Habit, Cribsheet and Brené Brown. I opened work and edition pages, created a "Nap reads" list and made it the default, saved books, added a genre, a subject and a note, used the graph (both the circles and the List view), opened the Habit subject page and the Michelle Obama author page, looked at Recommendations, removed books from the list, exported a CSV, and opened the Add library form in Settings.
- **Test setup notes (not app findings):** API calls to api.shelfthread.com were routed to the local backend because of CORS. The root "/" showed a stray "Connect this item to…" screen (an untracked file in the working tree), so I couldn't reach the real home page with its scan button and ISBN entry, or any "continue where you left off" area. I started from /search instead.
- **What I couldn't test:** camera or batch scanning (so I can't say whether scanning is quiet), a real iPhone with real thumbs, VoiceOver, or the deployed site. Browser confirm dialogs were accepted automatically by the script. On a phone those would be system pop-ups.

## 1. Initial impressions; mobile vs desktop

It's calm, and that matters to me. Cream background, big serif titles, nothing flashing. The search page is just a box and a line of help text. The phone view is the one I'd actually use. On desktop the content sits in a narrow center column with a lot of empty space on each side. It's fine, but I'm never at a desk when I have time to read. On the phone the one problem is that both navigation icons (My Library and Search) are in the top-right corner. Holding a baby in my left arm, that's the hardest spot for my thumb to reach. The bottom sheets for saving were easy to reach, though.

## 2. Search and book page

I found Atomic Habits right away: correct cover, at the top of the list. Under it, though, came workbooks, journals, "Summary of…" knockoffs and a Polish translation. Becoming was worse: Michelle Obama's book was fifth, after *Becoming Supernatural* and *The Velveteen Rabbit*. I ended up saving a book called "Becoming Michelle Obama" by someone else, because I tapped the first line that said "Michelle Obama".

The book page is good at the top: cover, rating (4.1 from 3,965), a real description, Save to list. Helpful. Further down, less so:
- "Find Your Edition (37)" starts with a Catalan paperback and an Indian edition whose "cover" is a screenshot of someone's phone.
- "More by this author" for James Clear is "automic habbit", a Turkish translation, a 4-book box set and a daily calendar. That's junk.
- The buy/borrow links I asked for (Bookshop.org, WorldCat, my library) **only appear on an edition page, not the main book page**. I had to dig for them.

## 2a. Work vs edition

I understand "the book" versus "my copy", but I don't want to have to think about it. The real problem is that the app makes me choose. Tapping **Save to list asks me to "Choose an edition"** from a scrolling list of 20–37 ISBNs, and the first entries are often foreign or young-readers editions. Without meaning to, I saved the Spanish *Shoe Dog* ("Nunca te pares") and *Becoming: Adapted for Young Readers*. There is a "Save the work instead" link, but it sits at the very bottom of that long list. That should be the big default button, not the escape hatch. The edition page also drops the real description and shows only "Source title: …".

## 2b. Terms and notes

It worked, eventually. The lock icon next to Save means "edit". I wouldn't have guessed that, because a lock reads as "private". The first time I tapped it, it told me to "Save this book to a list before editing", even though the book was already ticked in Nap reads. I had to tap Done, and then the edit fields appeared. I added the genre "Self-help", the subject "Parenting routines" and the note "Ch. 3 during 2am feed. Try habit stacking with bedtime routine." They were still there after a reload, and the note even made it into the CSV export. Nice. But in edit mode every subject becomes an orange chip with an ×. That's the "wall of little orange chips" again, and one long chip runs off the right edge of the screen. To save, I have to scroll back up to the lock. A Save button at the bottom would be better.

## 3. Graph view

Prettier and simpler than I expected. One green circle in the middle, labeled spokes, a color legend, and zoom buttons in the bottom-right corner (good for my right thumb). Tapping "Personal Growth" gave me *The Power of Habit*, *Influence*, *Blink*, *Emotional Intelligence* and *Big Magic*. That's genuinely my shelf. The **List** button turns it into a readable list, which I prefer one-handed. Some neighbors are odd (*A second chicken soup for the woman's soul*, "Aspectos Religiosos"). On long titles the header text runs into the My Library icon. It's a nice extra, but I'd never open it during a 10-minute nap.

## 3a. Subject page

"Habit" shows a definition that reads like a bad translation ("action that is so strong internalized by humans…"), then broader and narrower topics, then sort buttons. The list starts well (Atomic Habits, The Power of Habit) and then goes off: *Green Eggs and Ham*, *Brown Bear, Brown Bear*, *The Satanic Verses*, *Night Shift*. A "View Behavior" hover tooltip was left floating over the headings. For nonfiction it's a coin toss. A Parenting book (Cribsheet) did get proper "Parenting / Parenthood" subjects, and that pleased me.

## 4. Lists and recommendations

Saving takes 3–4 taps (Save, edition, list, Done), not one. After I set a default list in Settings it came pre-ticked, but I still had to pick an edition and tap Done. The list page is bare: titles and red Remove buttons, no covers or authors. Remove brings up a scary system pop-up ("its notes are deleted. This can't be undone"). After I saved the same book twice it showed *Shoe Dog* twice.

Recommendations: the first time I opened them they showed only "More by James Clear (8)", the same junk as above. After I'd tapped through my saved books, they became properly good. "Because you like Biography" gave me Steve Jobs, Born a Crime and I Know Why the Caged Bird Sings. "Business" gave me Deep Work, Mindset and The Psychology of Money. That's a real "if you liked this" list for my genres, finally. Two catches: *A Child Called "It"* isn't what a sleep-deprived new mum wants suggested, and there was nothing for parenting (I'd only saved one parenting book). CSV export works and looks Goodreads-compatible, but it had 5 rows when my list showed 7. A work saved via "Save the work instead" got some random edition's ISBN (a Spanish one for The Power of Habit).

## 5. Author search and page

There isn't really an "author search". The Author filter returns Brené Brown's *books* (which is useful in itself, and *The gifts of imperfect parenting* caught my eye). To get to an author page I had to open a book and tap the underlined name. Michelle Obama's page has dates (1964 – present), Save, Graph and a Works list (Becoming, The Light We Carry, American Grown). It's clean, but there's no photo and no bio, and her cookbook and a "Follow That Food!" kids' book sit next to her memoirs. It's adequate. I'd glance at it, not linger.

## 6. Light vs dark

Dark is what I'd use at 2am feeds. It's soft charcoal rather than pure black, the covers pop, and the green buttons and orange subject chips still read clearly. The graph actually looks better in dark. Light mode is warm and pleasant for daytime. I'd leave it on "System", which is the default. Nothing to fix here.

## 7. Three favorite things

1. Recommendations that finally take biography and business seriously (Born a Crime, Deep Work, Steve Jobs).
2. Notes that save, and a CSV export that carries them.
3. Calm design, a good dark mode, and bottom sheets my thumb can reach.

## 8. Three least favorite things

1. Saving isn't one tap. The edition picker is a homework question, and it led me to save the wrong language and the wrong book.
2. Too much junk: workbooks and knockoffs in search, "automic habbit" under More by this author, Green Eggs and Ham under Habit.
3. Things I need are hidden: navigation in the top corner, buy/borrow links only on edition pages, a lock icon that means "edit", and recommendations that are nearly empty until I revisit my books.

## 9. New features

- A true one-tap "Want to read" heart that saves the work to my default list with no questions asked.
- Bottom tab bar (Search, Lists, Recs).
- A "pick up where you left off" / recently viewed strip (I couldn't reach the home page to see if it exists).
- Library and Bookshop links on the main book page.
- An option to hide workbooks and summaries in search.
- A "short reads / read in 10 minutes" filter and a parenting shelf.
- Covers in lists.
- An undo toast instead of the scary delete pop-up.
- Silent batch scanning (couldn't test).

## 10. Overall

There's a good app in here for me. The recommendations and notes prove it. But every task asks me one more question than I have attention for. Strip saving down to one tap, move the buttons down to my thumb, and filter out the junk editions, and I'd call it *Next Chapter* and keep it on my home screen.

## 11. Ease of use and accessibility

Mostly easy to read. Big text, clear contrast in both themes. Getting things done one-handed is harder: the top-right navigation, the long scrolling edition modal in the middle of the screen, the save-edits control back at the top of the page, and system confirm pop-ups. I didn't need any accessibility features. I did use dark mode and the graph's List view as comfort features, and both worked well. I noticed the graph has spoken-style labels on every circle, which is a nice touch even though I didn't use them.

## 12. Would you use it again?

Probably, for recommendations on a weekend evening. In daily life I'd only use it if saving becomes one tap and the scan is quiet. Right now it's "maybe", leaning yes.

## Assumptions outside the persona

- I treated a web browser at iPhone size as a stand-in for her iPhone. I assumed she holds the baby in her left arm and taps with her right thumb.
- I chose the specific books (The Power of Habit, Cribsheet, Brené Brown) as plausible for her genres. The persona names only Becoming, Shoe Dog and Atomic Habits.
- I named the list "Nap reads" and assumed she'd set it as her default list.
- I assumed she wants English editions and doesn't care about specific editions or ISBNs.
- I counted the recommendations' cold start as a real issue. It may be specific to a fresh browser session.
- I assumed system confirm pop-ups on iPhone would feel like an interruption to her.
