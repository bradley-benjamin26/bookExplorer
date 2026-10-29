# P4 — Dorothy, 68

I have just joined a library book club and a church book club, so I would like to know what a book is about before we meet and keep my own thoughts with it. I am willing to learn a new app, but I appreciate clear words and a little reassurance.

**What I could inspect:** I reviewed `docs/userQuestions.txt` and the app's home, search, book/work, subject, author, graph, saved, and recommendations screens and related components. I also opened the running web UI at `http://localhost:8081`. The page showed “Connect this item to…” with a search field, rather than the home screen. I tried its “Shelf Thread” home link, but it did not activate. I therefore did not successfully search for or open a book, and did not interact with the book, graph, or author screens. Those observations below are explicitly based on source unless stated otherwise.

## 1) First impressions; mobile or desktop?

The app looks as though it wants to be a calm place for books: it uses bookish display fonts and a restrained paper-like theme, and its layout limits wide-screen content to a reading-width column. The home screen source gives “Scan a book” a large, prominent button and also offers a plain search field for title, author, or ISBN. That sounds reassuring to me; I would know where to begin.

The live web screen I reached was not that home screen, so I cannot fairly report its rendered appearance or compare mobile with desktop from direct use. From the source, I would probably choose the mobile or tablet view, since those are the devices I use and the scan action seems especially handy in a bookshop. The desktop layout's centered, bounded column also sounds comfortable, rather than making me read across a very wide screen.

## 2) Find an interesting book and describe its page

I was not able to complete a search in the running UI, so I cannot say that I found a particular book or judge the live page's information. In the source, search can be by title, author, or subject; the home field also accepts an ISBN. Search results open a work page.

On that page, a description appears near the top when the data includes one, followed by ways to explore editions, genres and subjects, awards, series, more books by the author, and reviews. I would find a description, author link, and series information useful before a club meeting. The description is conditional, however: if no description is available, the page has no summary there. The edition list and external catalog/shop links may also be more detail than I need when I am simply trying to understand the story.

### 2a) Work versus edition

The distinction is reasonably understandable from the source. A work page gathers information about the title as a whole and offers “Find Your Edition”; editions are presented with details such as format, publisher, and publication date, and a book page is reached by ISBN. I would understand that the work is the story and an edition is a particular copy or publication. I cannot confirm how clear the distinction feels in actual use because I did not open either page.

### 2b) Add terms and notes

The source provides an edit-lock control for genres, subjects, and notes. On a work or edition page, saving creates the local record; then the edit control lets a person edit those details, with wording indicating that locking saves the edits. Notes are shown as “Your Notes” when present. I like that notes are kept with the book, which suits both clubs.

I did not try these controls in the UI. From the source, I would need to understand that I must save the book before I can edit its record, and then use the lock control to finish saving changes. That is a little less obvious than a direct “Add a note” button. I found share controls for book pages, but no indication in the inspected screens that the notes themselves can be shared with a club.

## 3) Graph view and nodes

I did not open or tap the graph in the running app. From source, book, author, and subject pages have a “View as Graph” button. The graph has a legend for node kinds, controls to filter what is shown, a graph/list switch, and node taps that move the graph's focus. There are also navigation controls to go back through graph views.

I would probably find this interesting once someone showed me how it works, but it would not be my first choice for preparing for a book-club meeting. A graph may show connections I would not otherwise notice, yet I prefer a quiet list and a plain explanation of what each connection means. The graph/list switch is a welcome alternative; I would want to know whether a node is a book, author, or subject before tapping it.

### 3a) Subject term page

I did not open a subject page in the live UI. The source shows a subject page with a description when available, a count of works, broader and narrower topics, and a list of books that can be sorted. It also offers a graph view. That sounds useful for finding other books on a topic, though the page is less useful if its description is absent or if the topic label itself is unfamiliar. I cannot assess the quality of any particular subject entry without seeing its actual data.

## 4) Save items and view recommendations

I could not save an item or judge specific recommendations in the live app. The source has controls to save works and books, create lists, and show recommendations with filters for all lists or an individual list. That would be useful for keeping the two clubs' reading separate, if I can tell which list an item belongs to. I cannot say whether the recommendations are good without seeing and trying the results.

## 5) Search for an author and open the page

I could not perform the search or open a particular author page. The source offers an Author search mode, and book pages link author names to author pages. The author page can show a biography, dates, pseudonyms, works, and related influences, and it can be saved to a list. A biography and a clear works list would help me learn about an author before our discussion. I cannot judge the accuracy or completeness of a particular biography without the loaded page and its data.

## 6) Name: “Free Book Reader”

I would not choose “Free Book Reader.” It sounds as if the app is mainly for reading books on the screen, which is not the reason I am looking for it. I like “Book Explorer” because it plainly says what I can do. “Book Connections,” which I have suggested before, also describes finding links between books and authors. The inspected home screen currently says “Shelf Thread”; I cannot tell from the source alone whether that name is final.

## 7) Three favorite things

1. The “Scan a book” button is prominent on the home screen, so I would know what to press in a bookstore.
2. The work page brings together a description when available, editions, author links, subjects, and series information—details I want before a meeting.
3. I can keep personal notes with a saved book and make lists, which could help me remember what I thought and keep club reading organized.

## 8) Three least favorite things

1. A book description is only shown when the data provides one, so I may still arrive at a book page that does not tell me what the book is about.
2. Adding notes appears to depend on saving the record and using the edit-lock control. I would prefer a straightforward “Add a note” action, and I did not find evidence that notes can be shared with my club.
3. Graphs, filters, and technical-looking distinctions could take me away from the simple book-and-notes task I came for. I would be more comfortable if the ordinary list view remained easy to find.

## 9) New features that would interest me

I would value a plain-language book summary near the top of every book page when one can be found; a short author background and series order; simple notes that are easy to share with either club; and a way to keep each club's list separate. A larger-text choice in the app would help me. The source has appearance choices for system, standard, and dark themes, but I did not find a dedicated text-size setting in the screens I reviewed.

## 10) Overall thoughts

The features I could inspect in source seem close to what I need: discover a title, learn about it, keep a note, and find related books. The prominent scan action and familiar words such as “Books,” “Subjects,” and “Your Notes” sound welcoming. I would want the summary to be dependable and the note-saving step to be plainly explained. I did not see subscription language in the screens I reviewed; I cannot make a broader claim about every part of the app.

## 11) Ease of use and accessibility

I cannot give a complete ease-of-use verdict because the live page did not take me to the home screen and I could not test the main tasks. The source uses visible text labels for the main actions, which is helpful to me, and the theme can follow the system setting or be set to Standard or Dark. I did not find a dedicated in-app text-size control. Text sizes in the theme source start at 14 points for the smallest scale and 16 for the standard body scale; I would want to see how those look with my larger device text setting. I did not test a screen reader or other accessibility feature.

## 12) Would I use it again?

I would be willing to try it again if I could reach the home screen and see whether the search, book summaries, and note-taking work as they sound. For now, I cannot say I completed any of those tasks in the running app.

## Assumptions

- I treated the app source I inspected as the intended implementation, but the live web UI did not match the expected home-screen flow, so source-based descriptions are not confirmed as working end to end.
- I assumed the locally saved records and lists are personal unless the interface explicitly offers sharing. The inspected share controls appeared to share book pages; I did not verify whether another export or sharing feature can share notes.
- I inferred that “work” means the overall literary title and “edition” means a particular publication from the screen labels and edition metadata; I did not open a real work/edition pair to verify it.
- I did not search for a particular book or author, save an item, inspect recommendations, or tap a graph node, so I make no claims about specific data, search success, or recommendation quality.
