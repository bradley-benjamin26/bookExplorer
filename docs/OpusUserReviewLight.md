# Opus User Review: Light Mode

## Method

These are **simulated, persona-based reviews**, not observed tests with real people. This is a follow-up to [OpusUserReview.md](OpusUserReview.md): the same six AI participants, who had already reviewed the app in dark mode, were shown the same session again in light mode.

The session was the real Expo web build at iPhone size (390×844), with live data from the dev server. The browser's color scheme was set to light, and the app's default "System" theme follows it. That gave 32 screenshots across:

- Home and search
- Book pages for Dune (already saved), Saga Vol. 1 and Atomic Habits
- Author page, subject page, graph view and Find Connection
- Scan screen, My Library and the Edit panel

Participants answered **styling questions only**: colors, contrast, readability and overall feel. They compared light mode against the dark session they had already seen. Contrast was judged by eye, not measured against WCAG.

| ID | Profile |
|---|---|
| P1 | 13, loves reading, goes to the library often with her parents |
| P2 | 18, nerdy, reads comics and sci-fi, rarely goes to the library |
| P3a | 22, recent college graduate, busy with work, making time to read |
| P3b | 35, working new parent, likes biographies, business and self-help |
| P4 | 68, retired, some trouble with new technology but a quick study, joining book clubs |
| P5 | 29, heavy Goodreads user, voracious reader, has used many reading apps |

## 1) Overall opinion of the light design

- **P1:** Like a page in a real book: cream paper, black serif titles. The dark green buttons look "way more serious and grown-up" than dark mode's mint ones, and covers pop with their soft shadow.
- **P2:** Cleaner than he expected. It reads like an old paperback page, and covers pop more. It's calmer and less "techy" than dark.
- **P3a:** Really likes it. It feels like a bookstore display, and the forest-green buttons look "more confident and grown-up."
- **P3b:** Warmer and more like paper, like a nice hardcover. Covers look "like books on a shelf instead of floating in the dark." It looks finished and calm.
- **P4:** Feels like reading a real book. The deep green buttons "say press me," and the Science Fiction list "looks like a nice library shelf."
- **P5:** Feels like an indie bookstore rather than a tech app. The author page with its stack of Dune covers is "probably the prettiest screen in either theme."

## 2) Easier or harder to see than in dark mode

**Easier:**
- **Primary buttons:** white text on dark green ("Scan a book", "View as Graph", "Find Connection", "Grant Permission") reads better than dark mode's dark text on mint (all six).
- **Graph nodes:** navy author, green book and rust subjects look crisper and richer on cream (all six).
- **Green text links:** "Frank Herbert", "Search on WorldCat" and "Edit subjects, genres & notes…" read clearly as tappable (P2, P4, P5).
- **Subject chips:** peach with rust text, and the blue topic chips on Science Fiction, are clearer than dark mode's "muddy brown blobs" (P1, P3a, P5).

**Harder:**
- **Grey secondary pills** ("My Library", "New Search", "Share", "Save", "Edit", "Filter", "List", "Export CSV") nearly melt into the cream and don't look like buttons (all six).
- **Empty cover placeholders** in search results and "More by Frank Herbert" almost vanish and "look like a page that didn't finish loading." In dark mode they read as deliberate placeholders (all six).
- **The "Not yet linked" legend dot** on the graph is barely visible (P1, P3a, P5).
- **Graph node labels** are still tiny in either theme (P2, P3a, P3b, P4, P5).
- **Small grey text** ("shares: author Frank Herbert", the Libraries paragraph) and the OL/WD/LC tags are faint (P4).

## 3) What they don't like about the light styling

- **The selected "System" chip under Appearance** is only a pale butter-yellow, so it's hard to tell which theme is picked (all six).
- **The pale pink "Remove" pill** doesn't read as a delete or warning action (P2, P3b, P5).
- **Pale-on-pale chips:** subject chips on Dune and Saga look faded rather than clickable, and the grey chips on the Edit screen blend "into one big beige block" (P2, P3b, P4).
- **"★ Saved" is rust text on a faint grey pill** and "doesn't feel like I did anything." In dark mode the orange glowed (P3a).
- **Mostly empty screens** (Scan, Find Connection, the ISBN-only recent list) look extra blank or unfinished against all the cream (P1, P5).
- **Header titles covered by the nav pills** ("Explore Gra…", "Find Conne…") are more noticeable on cream (P5).

## 4) Words that come to mind (light mode)

- **P1:** cozy, papery, calm, clean, old-fashioned, library card
- **P2:** cozy, paper, coffee-shop, library-ish, chill, kinda grown-up
- **P3a:** paper, calm, clean, bookish, cozy-café, a little faded
- **P3b:** warm, papery, calm, bookish, a little faded around the edges
- **P4:** warm, papery, gentle, calm, a little faded
- **P5:** cozy, paper, bookstore, calm, forest green, a little washed out

The most repeated words were *paper/papery* (6), *calm* (5), *cozy* (4) and *faded/washed out* (4). In dark mode the most repeated words were *nerdy* and *cluttered*.

## 5) Light or dark?

| Participant | Preference | When they'd use each |
|---|---|---|
| P1 (13) | Light (if she could only have one) | Light at the library; dark in bed at night |
| P2 (18) | Dark | Dark at night ("feels more sci-fi"); light in a bright comic shop or outdoors. Dark would "win easily" if its mint buttons were fixed |
| P3a (22) | Light for everyday | Light in the day and at bookstores; dark in bed |
| P3b (35) | Light for daytime | Light at lunch or in a bookstore; dark for 3 a.m. feeds |
| P4 (68) | Light | Light in the day, at the bookstore and at book club; dark in bed |
| P5 (29) | Light as daytime default | Light in the day, closer to Hardcover/StoryGraph; dark in bed. Light would be her "clear favorite" with stronger pills and placeholders |

Five of six prefer light for daytime. Everyone wants dark at night. The only participant who prefers dark overall is P2.

## Light mode styling fixes, by how many participants raised them

1. **Give the grey secondary pills more contrast** (a border or a darker fill) so they read as buttons (6/6).
2. **Make empty cover placeholders visible**, or show a book icon or the title initial, so they don't look like a failed load (6/6).
3. **Make the selected Appearance option obvious**, not a faint yellow (6/6).
4. **Darken the "Not yet linked" legend dot**, and enlarge graph node labels in both themes (3/6 and 5/6).
5. **Make "Remove" read as destructive** and "★ Saved" read as a clear confirmed state (3/6 and 1/6).
6. **Dark mode in return:** its mint primary buttons with dark text were weaker than light mode's (all six noticed when comparing).

