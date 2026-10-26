# Compiled User Review

This report combines six documents into one: Copilot, Luna6 and Opus each ran a main review and a light-theme review.

| Reviewer | Main report | Light report |
|---|---|---|
| Copilot | [copilotReview.md](copilotReview.md) | [copilotReviewLight.md](copilotReviewLight.md) |
| Luna6 | [Luna6UserReport.md](Luna6UserReport.md) | [Luna6UserReviewLight.md](Luna6UserReviewLight.md) |
| Opus | [OpusUserReview.md](OpusUserReview.md) | [OpusUserReviewLight.md](OpusUserReviewLight.md) |

All three reviews are **simulated, persona-based**. No real people took part. Every reviewer used the same six profiles: 13, 18, 22, 35, 68 and 29 years old. The brief labeled two profiles "Participant 3", so this report calls them **P3a** (22) and **P3b** (35).

## 1. How the reviews differ in method

The reviews do not carry equal weight. How much each one saw of the app decides how much its findings can be trusted.

| | Copilot | Luna6 | Opus |
|---|---|---|---|
| **What participants saw** | 11 screenshots of the running app, plus a written walkthrough | **Source code only.** The app could not be launched. | A recorded session of the running app at iPhone size (390×844) with live data |
| **Light-theme input** | 26 screenshots, compared against the dark ones | Palette values and font names read from the source | 32 screenshots, compared against the dark session |
| **Screens covered** | Home, scanner, Dune before and after saving, Science Fiction, Frank Herbert, graph, search ("becoming michelle obama"), My Library, Edit, Find Connection | Reasoned from the code | Home, search ("project hail mary"), Dune, Saga Vol. 1, Atomic Habits, author, subject, graph, Find Connection, scan, My Library, Edit |
| **Known bias** | The walkthrough **pointed out data problems in advance**, so complaints that "all six" made are partly prompted | Could not see real data or rendered screens, so it **missed every data-quality problem** | The fullest real-data coverage. The light section is copied word for word into both Opus files. |
| **Checked against code** | No | Read the code to describe CSV export | **Confirmed one bug** in `csv.ts` |

**What this means:** Opus is the most reliable source for what users actually see. Copilot's unanimous counts should be discounted where its briefing raised the issue first. Luna6 is most useful for structural and wording problems, and its silence on data quality does **not** mean the data is fine.

## 2. Major findings

These are ranked by how many reviews agree and how often participants raised the issue.

### 2.1 Subject tags are noisy, duplicated and look like code

- **Opus (6/6):** Participants saw raw tags such as `Nyt:Mass-Market-Monthly=2021-11-07` and `Award:Nebula_Award=Novel`. They also saw near-duplicates ("Science Fiction" / "Science-Fiction", "Dune (Imaginary Place)" / "Dune (Imaginary Place), Fiction") and OL/WD/LC source labels nobody understood. Descriptions included "a big pile of brown bubbles" and "raw database junk".
- **Copilot (6/6, prompted):** Messy and duplicate labels, plus "cataloging terms" that don't help browsing.
- **Luna6:** Not raised, because the data was never visible to it. Its light review does say the chips may not read as tappable.
- **Takeaway:** This is the clearest data problem in the reviews. It is the main reason "cluttered" became one of the most common dark-mode words.

### 2.2 The "Bookweft" name is clever but doesn't say what the app does

All three reviews agree that the "woven together" metaphor fits the graph and connections. They also agree that "weft" is an unfamiliar word that doesn't say what the app is for. All three noticed that the screen still says **Book Explorer**.

| Reviewer | Verdict on "Bookweft" |
|---|---|
| Opus | **Most negative.** 5 of 6 said no and P5 said "kind of". Concerns: it sounds like "bereft" or a typo, it's hard to spell or find in an app store, and it sounds like a craft app. |
| Copilot | **Most positive.** All six liked the meaning. 5 of 6 said it doesn't explain the app, and the 13-year-old didn't know the word. |
| Luna6 | **Mixed.** Each participant said it fits but is abstract. P5 would accept it if it were used consistently. |

Suggested names, tallied across all reviews:

| Name | Votes | From |
|---|---|---|
| **Next Chapter** | 5 | Luna6 ×3, Copilot ×1, Opus ×1 |
| **Book Trail(s) / Booktrail(s)** | 4 | Copilot ×2, Opus ×2 |
| **Next Read** | 3 | Opus ×3 (taken from the existing "find your next read" tagline) |
| Book Finder | 2 | Luna6 |
| ShelfScan | 2 | Opus |
| Book Explorer (keep it) | 1 named, several mentioned favorably | Luna6 P5, Opus P3b/P4, Copilot P1 |
| Book Threads, Shelfthread, Book Web, Book Connections, Shelf Space, Shelf Hop, Lore | 1 each | Mixed |

Most suggestions are about following a path or connection, the same idea as "Bookweft", in plainer words.

### 2.3 Recommendations and search results are hard to trust

- **Subject pages show old public-domain classics.** Opus (6/6) saw Alice in Wonderland, Dracula, Frankenstein and The Wizard of Oz under Science Fiction ("basically my high school reading list"). In Copilot, all six wanted more modern titles. Luna6 couldn't see this.
- **Search puts knock-offs first.** Opus (5/6) saw "Summary of…" study guides, then unrelated Shakespeare, below Project Hail Mary. Copilot (6/6, prompted) saw study guides ranked above *Becoming*.
- **Wrong or missing authors.** Copilot (6/6, prompted) saw *House Corrino* credited to the wrong authors (it is by Brian Herbert and Kevin J. Anderson). Opus found that Atomic Habits has no author and only three subjects, and that Saga leaves out Fiona Staples and has no volume or series information.
- **Non-fiction and comics are thin.** Opus P2, P3b and P5. The persona who reads business and self-help found the app "did poorly for her genres".
- **Takeaway:** Participants liked the idea of discovery, but most said they would not rely on the recommendations yet. P5 in Copilot said so directly.

### 2.4 "Recently looked at" shows ISBNs instead of titles

- **Opus: 6/6**, the only issue every Opus participant raised that needed no explanation.
- Copilot light: P3a.
- Luna6: not raised.

### 2.5 Graph and Find Connection need explanation

- **Find Connection:** Opus 6/6. It opens an empty "Connect Dune to…" box with no explanation. P2 said it gave "no clue what it does".
- **Graph:** Every review found it the hardest feature to understand. Node labels are tiny in both themes (Copilot light 6/6, Opus light 5/6). The graph was the worst screen for 5 of 6 Copilot light participants. Opus also found legend entries ("Genre", "Not yet linked") that never appeared, and the "swipe through them with a screen reader" hint confused P4.
- **Positive:** Participants liked the idea of the graph ("skill tree", "mind map").

### 2.6 My Library is one long page, and there are no named lists

- **Long page, export buried:** Luna6 (P3b, P4, P5) and Opus (P1, P3b, P4) both found saved books, recommendations, appearance, library setup and backup/export stacked on one page. "More by Frank Herbert" pushes export far down. Copilot did not raise this.
- **No separate named lists:** Luna6 (P1, P3b, P4: book-club lists and lists for different purposes) and Copilot (3 participants). Opus did not raise this.
- **No reading status or star rating:** Opus P5 and Copilot P5, the Goodreads power user in both.

### 2.7 Library catalog setup feels technical

All three reviews raised this: Luna6 (P1, P4), Copilot (P2, P4, and in the summary as one of the hardest parts) and Opus (P2, P4). Pasting a search-URL template is the problem. P4 in Opus said the explanation "lost her".

### 2.8 CSV export puts every subject in Goodreads' Bookshelves column (confirmed bug)

- Luna6 P5 spotted this from the source. Opus P5 suspected it, and Opus confirmed it in code.
- **Still present:** [csv.ts:49](../apps/app/src/csv.ts#L49) says "tags (subjects + genres) go in Bookshelves". Importing one Dune export would create about 25 Goodreads shelves, such as "Award:Hugo_Award=1966".
- Participants also wanted the export to state clearly what data carries over.

### 2.9 Sticky header and footer crowd the screen

- Copilot: 4 of 6 said the sticky header and footer overlap content on a phone. In light mode, 2 asked for a smaller footer.
- Opus: the header buttons cut off page titles ("Explore Gra…", "Find Conne…") (P2, P3a, and P5 in light mode).
- Copilot P3a also said the top buttons overlap page titles.

### 2.10 Blank cover placeholders look broken

- Opus: 6/6 in dark mode (in "More by Frank Herbert" in My Library). 6/6 in light mode, where they "look like a page that didn't finish loading".
- Copilot light: 6/6, and the reason P2 named My Library the worst screen.

## 3. Light theme findings

### Where the reviews agree

- **The light theme is well liked.** All three describe it as warm, bookish and like paper. Common words: *warm*, *bookish* and *calm* (Copilot); *paper/papery*, *calm*, *cozy* (Opus); "warm and cozy", "inviting" (Luna6). Opus noted that the most common dark-mode words were *nerdy* and *cluttered*, while light mode drew *papery* and *calm*.
- **Deep green primary buttons work.** All six in Copilot and all six in Opus agreed. Opus participants said white-on-green beats dark mode's dark-text-on-mint.
- **Small, muted grey text is too faint.** Copilot 6/6 (rating details, "shares: author…"), Luna6 (P68 asked for at least 14px instead of 13px, and P29 raised it too), and Opus P4.
- **Chips don't clearly read as tappable.** Luna6 (pastel chips too subtle, needing borders), Copilot P3a and P4 (rust/peach text is soft), and Opus (pale-on-pale chips, and the Edit screen as "one big beige block").
- **Graph labels are too small.** Copilot 6/6, Opus 5/6.

### Day versus night preference

Copilot and Opus found the same pattern. **Five of six prefer light during the day, and everyone wants dark at night.** In both reviews, P2 (18, comics and sci-fi) is the only one who prefers dark overall. Luna6 did not ask this question.

### Raised by only one review

| Issue | Source |
|---|---|
| Grey secondary pills (My Library, Share, Save, Edit, Export CSV…) blend into the cream and don't look like buttons, **6/6** | Opus |
| Selected Appearance option is only a faint yellow, so the current theme is unclear, **6/6** | Opus |
| Pale pink "Remove" doesn't read as destructive (3/6). "★ Saved" doesn't feel confirmed (1/6). | Opus |
| "Not yet linked" legend dot is barely visible (3/6) | Opus |
| Dark mode's mint buttons with dark text are weaker than light mode's | Opus |
| Rust means both "Saved" and "subject", so the colour has no single meaning | Copilot (P3a, P3b) |
| Too much empty space, especially on the home screen | Copilot (4/6) |
| Faded "WD"/"LC" source badges | Copilot (P1, P4, P5); Opus P4 |
| Pale row and card borders blend into the background | Luna6 (P13, P35) |
| Sections on book pages need clearer separation | Luna6 (P22) |

### Where the reviews disagree

- **Grey secondary pills.** Opus said all six found them nearly invisible. Copilot P4 said they are "distinct without competing". Opus showed more screens, so its result is probably closer to the truth, but the pills are worth checking directly.
- **Best screen.** All six Copilot participants named the Dune book page. In Opus, P5 named the author page as "probably the prettiest screen in either theme", and P4 singled out the Science Fiction list.

## 4. What participants liked

- **The scan and search starting point.** All three reviews say the main path (scan or search, open a book, save it) is easy. The "Scan a book" button stands out.
- **The author page.** In Opus, the Frank Herbert page (biography, the Dune series in order, "Influenced") was the most useful screen for P2, P3a, P4 and P5.
- **Exploring sideways** through subjects, authors and series, and narrower topics such as Cyberpunk or Science Fiction Comics. All three reviews mention it.
- **The look in both themes:** serif headings, big covers, and a calm, bookish tone.
- **Goodreads/StoryGraph import and export, notes, and Bookshop.org, WorldCat and library links.** These came up as uses beyond discovery: scanning in stores before buying, keeping want-to-read and book-club lists, and cataloguing shelves with batch scan.

## 5. Where each review added something unique

- **Copilot** was the only one to find the *House Corrino* wrong-author problem, rust having two meanings, and the excess home-screen space. It also made sticky-footer complaints the most visible.
- **Luna6** found the structural problems without seeing the app: the long My Library page, no named lists, technical catalog setup and the CSV export's columns. It was also the only one to give concrete type sizes (13px helper text should be at least 14px). It could not judge data quality.
- **Opus** found the most real-data problems: raw NYT and award tags, public-domain recommendations, ISBNs in "Recently looked at", the unexplained Find Connection, and missing authors and series on non-fiction and comics. It also found the light-mode control-state problems (pills, Appearance, Remove) and confirmed the CSV bug in code.

## 6. Overlap with your existing list

Several major findings are already in [userReviewPlan.md](userReviewPlan.md):

| Finding | Already on your list |
|---|---|
| 2.1 Noisy subject tags (OL labels, NYT tag, award tags) | Items 2, 3 and 4 |
| 2.3 Recommendation ordering | Item 5 (sorting) covers it partly |
| 2.4 ISBNs in "Recently looked at" | Item 9 |
| 2.6 Named lists, splitting up My Library | Items 1 and 6 |
| 2.9 Sticky footer | Item 7 |

Not on that list yet: the "Bookweft" naming decision, search ranking knock-offs above real books, wrong or missing authors, Find Connection and graph explanations, the CSV Bookshelves bug, library-setup wording, cover placeholders, and the light-theme contrast fixes.
