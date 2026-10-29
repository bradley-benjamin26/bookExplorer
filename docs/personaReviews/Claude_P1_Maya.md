# Persona review: P1 Maya, 13 (Claude)

## Review basis

**What I actually did (local app, Playwright, Chromium):**
- Phone (390x844, touch) and desktop (1280x900), light and dark (dark emulated via system color scheme; Settings > Appearance offers System / Standard / Dark).
- Searched "Wings of Fire", "Smile Raina Telgemeier", "Darkstalker", "Amulet Kibuishi", "Raina Telgemeier" (Author filter), and an ISBN.
- Opened the work page for *The Dragonet Prophecy*, picked an edition, made a list ("Want to read 🐉"), added a genre, a subject and a note, and reloaded to check what was saved.
- Graph: tapped Dragons, then Eragon, and tried List and Filter.
- Subject page for Dragons, including the Most read and Newest tabs.
- Saved 4 books, then opened Recommendations and expanded every group.
- Author page for Raina Telgemeier.

**Problems with the test setup (not Maya's problems, but worth knowing):**
- `/` showed a blank "connection (1) / Connect this item to…" screen, from the stray untracked `app/connection (1).tsx`. So I never saw the real home screen, which is where the scan button and ISBN entry live. I started from `/search` instead.
- The local web build sends API calls to `https://api.shelfthread.com`. From localhost those failed with **"Failed to fetch"** (CORS). In the test browser only, I rerouted those calls to `http://localhost:3001` and changed no code. Everything below used the local backend.

**What I couldn't test:** camera and batch scanning (the scan page only showed "Camera access is needed… Grant Permission"), a real iPhone with parental controls, Safari, and VoiceOver.

---

## 1. Initial impressions; mobile vs desktop

Ok first look: it's clean. Kind of plain, though? A cream page with a search box and that's it. Then I searched Wings of Fire and the covers showed up, and that was lowkey nice. The cover strip under "Find Your Edition" is cute too.

**Mobile, easily.** On my phone it fills the screen and the buttons are big. On the laptop it's the same skinny phone column in the middle, with empty beige space on both sides. It doesn't use the big screen at all.

Weird stuff I noticed right away:
- On the graph page, the title "Exploring The Dragonet Prophecy" runs into the library icon at the top.
- The top of the page says "Work". Work?? Like homework?

## 2. Search for a book and open its page

Found it right away. "Wings of Fire" showed the dragon books with real covers. But the **first result was a different *Wings of Fire*** with an old man on the cover (A. P. J. Abdul Kalam), and that confused me for a sec. None of the results say which book number they are. Searching Smile or Amulet gives like 4 to 6 copies of the same title, and I couldn't tell which one to tap.

The *Dragonet Prophecy* page:
- 👍 **Star rating 3.9 (135 ratings)** is right at the top. That's what I want when I'm standing at the library shelf.
- 👍 "More by this author" with covers. Super useful.
- 👎 **The big cover is an audiobook CD** ("DISC 1, read by Shannon McManus"). Not the book.
- 👎 **"About" isn't a description.** It's some kid's review ("I would describe this book as enjoyable…") with spoilers about who gets captured.
- 👎 **Nothing says it's Book 1 of Wings of Fire.** That's literally the #1 thing I wanted. I ended up writing "book 1 i think??" in my notes.
- 👎 "Find Your Edition (22)" is a lot of the same book, and some are "No cover" gray boxes.

## 2a. Work vs edition

Doesn't really make sense to me. I tapped an edition and the title **changed from "The Dragonet Prophecy" to "Wings of Fire"**, and the page header switched from "Work" to "Book". Is it the same book or not? The edition page has the good cover (the real dragon one), but the About section is gone. The only way back to the main page was the back arrow. Under my Save button on the work page it now says **"Saved: edition 9781338883190"**. That's a barcode number, not words. Fine for a librarian, I guess. I don't care which edition, I just want the book.

## 2b. Add terms and notes

Confusing at first. There's no "edit" or "add tag" button, just a tiny **lock icon** next to Save. I tapped it and it said I have to save to a list first. Then it made me pick an edition from a list of publishers and barcode numbers, which was kind of annoying. Then it asked me to pick a list. I had none, so I made one. The list form has Name and Description boxes, and I typed my list name into the wrong box the first time.

After that it went fine:
- **Notes** saved by themselves. I came back later and they were still there. 👍
- **Subjects:** I typed "BookTok" and it made a chip. Cool.
- **Genres:** when I typed "Fantasy", the suggestions were "Fantasy comedies (Motion pictures)", "Fantasy comedies (Television programs)", "Fantasy comics". That's the computer-code stuff again.
- **The big problem:** the first time I added BookTok and a genre, I left by refreshing the page, and **both were gone**. My note was still there. It turns out you have to tap the lock again to save, and nothing tells you that. When I did tap the lock, they stuck. (In the code, the save also runs if you navigate inside the app, but not if you reload or close the tab.)

## 3. Graph view

It's kind of fun! You tap a bubble and it zooms to that thing. The dark mode version looks really good, glowy. Tapping "Dragons" showed a ring of books, and I found **Eragon**, which I'd actually read.

But:
- **No covers in the graph**, just plain dots with tiny text (on the phone the labels are like 8px).
- The Dragons bubble went to **The Fall of the House of Usher, Tales of the Grotesque and Arabesque, Tristan und Isolde, A Game of Thrones, A Clash of Kings**. Super old or for grown-ups, and that's not what I want.
- The List view is easier to read, but it shows "Magic -- Juvenile Fiction" and "Dragons -- Juvenile Fiction". Those dashes look like code.

Nice extra. I wouldn't use it every time.

## 3a. Subject page (Dragons)

The page itself looks nice: covers, tabs for Most read / Top rated / Newest / Classic, and bubbles for bigger and smaller topics. But the books on it are the problem:
- **Most read:** A Game of Thrones, Fire & Blood, Iron Flame, **Red Dragon (Thomas Harris, that's the Hannibal serial-killer guy)**, a pile of George R. R. Martin, and then *The Dragonet Prophecy* way down at #12.
- **Newest:** J. R. Ward, a Dungeons & Dragons Monster Manual, a bunch of French books, and lots of "no cover" boxes.
- The "narrower topics" were Tarasque, Ladon (Greek Mythology), Dragon Slayer (Tale). Like, what.

My mom would not love this page. Not helpful for me. I'd still ask my librarian.

## 4. Lists and recommendations

Making the list was easy once I found it (it came from the lock flow), and Save to list after that took 2 taps. I named it "Want to read 🐉" and **the emoji worked**, yay. The bad part is that **the list page has no covers**. It's just titles and four red "Remove" buttons, and that's not something I'd show my parents. There's Export CSV/JSON, which I don't know what to do with. Also, Recommendations isn't on the list page. I found it under the library icon > My Library.

Recommendations, honestly a mix:
- ✅ Good ones: **Harry Potter, The Hunger Games, The Lightning Thief, Diary of a Wimpy Kid, Charlotte's Web**. More Wings of Fire books, and more Kazu Kibuishi (Flight, Explorer). I'd add some of these.
- ❌ It recommended **Darkstalker, which is already on my list**.
- ❌ **"Because you like Fiction": Fifty Shades of Grey, It (Stephen King), It Ends With Us, It Starts with Us, Girl in Pieces.** Under "Fantasy" it had A Court of Thorns and Roses and A Game of Thrones. I'm 13. If my dad saw this on my phone, the app would be deleted.
- Headings like "Because you like Fantasy (2 saved) (8)" have two numbers in parentheses and I don't get what either one means. "shares: Fantasy, Fantasy fiction, Ficti…" is cut off and doesn't help.
- It didn't seem to notice I saved *Smile*. There was no "More by Raina Telgemeier" group.

## 5. Author page

Searching "Raina Telgemeier" with the Author filter gave me her **books**, not her. I got to her page by tapping her name under a book. The page is ok: birthday, a short About, and her works with covers. But:
- **No picture of her.**
- The About shows "\*Smile\* and \*Sisters\*" with stars around the words. Looks broken.
- Only 8 works and no "show more". The Baby-Sitters Club graphic novels are mixed in, which is fine.

Kind of helpful. The "More by this author" on a book page is honestly better.

## 6. Light vs dark

**Dark.** The green buttons pop, the graph glows, and covers look better on dark. Light mode is cozy, like old paper, but kind of beige-on-beige. In dark mode, a white-background cover (like the audiobook CD) looks like a weird bright box. Both are readable. I'd keep it on dark.

## 7. Three favorite things

1. **Ratings and covers** right on the book page and in search.
2. **"More by this author"** and the Wings of Fire / Amulet recs. That's exactly how I find the next book.
3. **Lists with emoji names**, and notes that just save.

## 8. Three least favorite things

1. **Grown-up books everywhere**: Fifty Shades, It Ends With Us, Red Dragon, Game of Thrones in recs and on the Dragons page.
2. **No series number.** I can't tell which Wings of Fire comes next, and searches show tons of duplicate copies.
3. **Code-looking stuff**: barcode numbers, "Magic -- Juvenile Fiction", "Fantasy comedies (Motion pictures)", the lock icon instead of a real button, and the list page with no covers.

## 9. New features I'd want

- **"Book 3 of Wings of Fire"** on every book, plus a "next in series" button.
- A **kid / teen mode** (or a setting my parents can turn on) that hides adult books.
- **Covers on my lists**, and a way to show the list to my parents (a pretty link or picture, not CSV).
- A **"New & popular" filter** so "more like this" shows stuff from the last few years.
- Make the scan button easy to find (I never saw one from the search page). Batch scan my tote bag at checkout.
- A "BookTok" or "trending" section.

## 10. Overall

It's pretty and kind of grown-up. It works better than I expected for finding a book and seeing its rating. But it acts like it's for librarians, and nothing in it filters for my age. The Wings of Fire stuff was great. The recommendations scared me a little. 6/10.

## 11. Easy to use? Accessibility

Searching and opening a book is easy. Editing is not: the lock icon, having to pick an edition and then a list before I can write anything, and not knowing that edits only save when you tap the lock again. I didn't use any accessibility features. The graph labels on phone are really tiny, and I'd have to zoom in (the +/- buttons work). In the code, the buttons have labels like "Edit genres, subjects and notes", which would probably help a screen reader, but I didn't test one.

## 12. Use it again?

Maybe, but only to check a rating or "more by this author" at the library. I wouldn't hand my phone to my parents with the recommendations open. If it showed series numbers and hid adult books, then yeah, probably.

---

## Assumptions outside the persona

- I assumed Maya's typical searches are Wings of Fire, Raina Telgemeier, and Kazu Kibuishi's *Amulet*. Amulet isn't named in the persona; I chose it as a typical graphic novel for her.
- I assumed her parents would object to adult titles like *Fifty Shades*, *It Ends With Us*, and *Red Dragon*. The persona only says parents "may want content filtering".
- I treated dark mode as set by the phone's system setting. I didn't test toggling it inside Settings.
- I assumed that leaving by reloading or closing the tab is a normal way for her to leave a page. That's how the genre/subject edits got lost.
- The API reroute (production API to localhost) was a workaround in the test browser only. A real user on localhost would just see "Failed to fetch".
- Scanning, the iPhone itself, parental controls, and the real home screen were not tested (see Review basis).
