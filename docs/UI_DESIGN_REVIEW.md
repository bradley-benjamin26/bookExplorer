# Shelf Thread UI design review

## Overall impression

Shelf Thread does not look like a generic AI application across the board. The
serif typography, restrained book-list rows, and thread-and-node motif already
give it a more literary identity than the supplied Libella screenshot.

The overlap is real, though: both use an off-white background, green actions,
rounded controls, and a serif/sans pairing. Libella's green is brighter and its
referenced screen is more card-and-pill-heavy; Shelf Thread's darker green and
simpler layouts feel quieter. Changing only the button radius would reduce one
similarity, but it would not create a distinctive identity.

Build on what is genuinely distinctive about Shelf Thread: **following
connections between books**.

## Scope and observations

The home screen was viewed in light and dark modes, along with search results,
the empty library, and settings at phone width. The detail and graph screen
implementations were also reviewed, but their live data did not finish loading
during the visual check. Recommendations for those screens are therefore based
on their code rather than rendered screens.

- **Home:** The colored nodes and connecting line are the strongest distinctive
  element. But the large introduction, feedback banner, scan button, and search
  field compete for attention. The diagram currently feels more like a legend
  than an invitation to explore.
- **Search:** The cover/title/author rows are clean and useful. Keep their
  simplicity rather than turning them into cards. A little more separation
  between results and the filters could help.
- **My Library:** The empty state nicely repeats the thread motif. The account
  rows appear before "Your lists," however, so the page initially feels more
  like an integration/settings hub than a personal library.
- **Settings:** It is clear and functional. The pill-shaped appearance controls
  are appropriate as a small group of choices; they do not all need to
  disappear.
- **Book and work pages:** The shared detail layout places save/share controls
  above two equally prominent primary actions, "View as graph" and "Find
  connection." Consider making the graph the clear primary action, with "Find
  connection" secondary, if that reflects the intended journey. See
  [DetailTop.tsx](../apps/app/src/components/DetailTop.tsx) and
  [the book detail screen](../apps/app/app/book/%5Bisbn%5D.tsx).
- **Graph:** This is the opportunity to own a visual language that a typical
  library-tracking app cannot. The existing graph/list alternative and labeled
  legend are valuable; any visual refinement should preserve those accessible
  ways to explore.

## A direction: "the reader's field notes"

Think of the app as a **reader's annotated map**, not a digital bookshelf or a
dashboard. The existing [design plan](DESIGN_PLAN.md) already calls this
*marginalia*. Express it through:

- **A thread as navigation:** subtle connecting lines between related items, not
  decorative lines everywhere.
- **Editorial hierarchy:** book titles and meaningful section headings in
  serif; controls, metadata, and longer functional text in sans serif. Fraunces
  and Inter are already in use, so a font change is not necessary.
- **Pages rather than cards:** use dividers, spacing, and small labels to
  organize content. Let book covers supply visual richness.
- **Rectangular actions, purposeful chips:** use modest 6-8 px corners for
  buttons, but retain compact chips where they genuinely represent a filter or
  subject. Shapes should communicate function, not be a blanket style rule.

For example, the home introduction could show a **small, plausible connection**
rather than four abstract categories: a book, its author, and a related
subject. It would explain the product and make the thread feel like a journey.
Keep it illustrative and avoid implying real book relationships unless they
are accurate.

## A light-green-and-orange palette

This can work well, especially if the green is a **very pale, gray-green paper**
and the orange is a **deep burnt orange**, rather than bright mint and orange.
That would move away from the reference while retaining a bookish, warm
character.

A starting palette to prototype, not a finished brand system:

| Role | Color | Hex |
|---|---|---|
| Page background | pale sage paper | `#EDF3E8` |
| Text | deep green-black | `#202B25` |
| Primary button | burnt orange | `#B94E25` |
| Button text | white | `#FFFFFF` |
| Links / orange text | deeper rust | `#A84623` |
| Quiet secondary accent | slate blue | `#375663` |

Contrast checks for these exact pairs:

| Foreground | Background | Contrast |
|---|---|---:|
| White `#FFFFFF` | Burnt orange `#B94E25` | 5.02:1 |
| Deep text `#202B25` | Sage `#EDF3E8` | 12.96:1 |
| Rust `#A84623` | Sage `#EDF3E8` | 5.21:1 |

These exceed the WCAG AA **4.5:1** threshold for normal text. By contrast,
white on a brighter orange such as `#D97842` is only **3.13:1**, so that
combination would not pass for ordinary button labels.

Keep most surfaces neutral and use orange sparingly for the *main action*. A
full green background plus many orange controls could become visually loud,
especially alongside colorful book covers and graph nodes. The current palette
reserves a rust color for saved states and graph highlights in
[themeColors.ts](../apps/app/src/themeColors.ts); if orange becomes the primary
action, those meanings need reconsidering rather than simply recoloring
`primary`.

Dark mode needs its **own tuned palette**, not an inverted version of the light
one. Focus rings, selected states, borders, graph labels, and every actual
foreground/background pairing would also need contrast checks. The existing
[theme tests](../apps/app/src/theme.test.ts) are a useful foundation.

## What to try first

1. **Prototype just Home, a book/work page, and the graph** in the
   sage-and-rust palette. These are enough to test whether the identity holds up
   with text, covers, controls, and graph colors.
2. **Give the graph action priority** on detail pages, and make the thread motif
   explain relationships rather than serve as decoration.
3. **Move "Your lists" above account connections** in the library, so the
   reader's own content leads.
4. **Replace general-purpose pill buttons with softly rounded rectangles**,
   while keeping segmented filters compact and clearly selected.
5. Compare the prototype in light and dark mode, with real covers and long
   titles, before applying it to every page.

Do not chase uniqueness through color alone. The most recognizable version of
Shelf Thread would be one where the palette supports a clear idea: *a reader
following a thread from one book to another*.

## Follow-up: prototypes

Two standalone, linked, clickable concepts explore this direction:

- [Home prototype](home-prototype.html): sage-and-rust colors, a scan-first
  layout, sample search, and an illustrated thread.
- [Graph prototype](graph-prototype.html): an interactive sample graph with
  recentering, previous-thread navigation, type filters, and a list view.

Both use fictional content and are design explorations rather than the live
app. The home prototype's scanner and library controls describe the intended
actions; they do not access the camera or the user's library. The graph
prototype uses fixed sample layouts and does not implement the production
graph's full interaction set. Neither is a printable-map prototype.

## Follow-up: freemium and exports

### Product principles

The goal is for Shelf Thread to remain generally free, without advertising or
Amazon affiliate links. It should complement existing reading trackers rather
than add reading progress, goals, ratings, or other tracker features. Store
fees, infrastructure, and maintenance are real costs that a paid option could
help cover.

The user's idea is to keep search and discovery as the free core and charge for
export options. A suggested distinction is to keep a **basic backup or data
export** free, so readers can recover their saved lists and notes, while charging
for optional, polished or specialized outputs. This distinction is a proposal,
not a finalized pricing decision; the app already offers import and export.

| Potentially free | Potentially paid |
|---|---|
| Scanning, searching, and ordinary graph exploration | Polished graph or trail exports as images or PDFs |
| Finding and viewing connections | Print layouts, color palettes, and customization |
| Basic sharing, saving, backup, and data export | Optional titles, notes, or specialized output formats |
| Accessibility features | Other advanced exploration or creative tools |

Other ideas discussed were a one-time supporter edition with optional themes or
graph styles, a voluntary recurring contribution, richer connection
exploration, and a personal discovery notebook for ideas and connections rather
than reading progress. These are alternatives or future possibilities, not
requirements. Avoid removing current free capabilities or making the free
experience artificially restrictive.

A one-time unlock may suit exports generated largely from data already
retrieved; a subscription might be appropriate only if a future feature has
meaningful ongoing costs. Actual pricing, store rules, and costs still need
investigation.

### Illustrated printable maps

The proposed paid feature turns discovery into a curated artifact instead of
just exporting a screenshot. Two related formats are worth exploring:

- **Book constellation:** a central book with selected authors, subjects,
  genres, and related books branching out. The starting cover could be larger,
  with relationship labels along the connecting threads.
- **Discovery trail:** an ordered sequence showing how a reader got from one
  item to another. Covers can appear in reading order, with authors and
  subjects as signposts and relationship labels explaining each step.

Readers could choose which connections to include, choose a title and optional
note, preview the output, and select a layout or color palette. A preview
before purchase would make the value clear. Preparing an export should reuse
already fetched information where possible instead of requiring a second slow
discovery.

Book covers and portraits would make these maps more personal and colorful:

- Show book covers with readable title and author text, rather than relying on
  small cover lettering.
- Show an author portrait when available and permitted, with an intentional
  typographic or initials-based fallback.
- Offer a choice among available covers or portraits when feasible, plus a
  no-image option. Identify editions where possible: alternate covers can
  represent different editions.
- Use an intentional book-shaped placeholder when a cover is missing. Consider
  letting the reader exclude an image or choose an alternative.
- Let readers curate dense maps so covers, labels, and connections remain
  legible.

Before offering images for download or print, check each provider's terms,
permitted reuse, and attribution requirements, including for paid exports.
Availability in the app does not by itself establish permission for export.
Include readable labels and an accessible textual description of the trail;
an accessible PDF should not consist only of an image.

### Subject and genre labels

Subject and genre nodes do not require a separate image for every term. The app
can create **typographic labels** directly from their names: a small Inter
category label, a larger Fraunces name, and a restrained border, line, or thread
node. Subjects and genres can use subtly different treatments, but should
retain textual labels so their meaning does not depend on color.

Labels could act as compact signposts in a trail or larger annotations in a
constellation. Wrap long names and allow the node to grow rather than silently
truncating important information. This approach produces consistent graphics
for arbitrary terms without requiring a bespoke illustration library or
AI-generated imagery.

### Waiting for slow sources

The user noted that slow APIs already make graph generation take time. A
beautiful export could give the wait a meaningful payoff, but the interface
should be honest about what is happening:

1. **Finding connections:** explain that library sources may take a moment.
2. **Connections ready:** show the available results and identify any gaps.
3. **Preparing the map:** lay out the information that has been retrieved.
4. **Preview and export:** let the reader adjust and save the result.

Readers could choose a title or layout while data loads, without losing
progress or starting over. If a source is slow or unavailable, consider a
clearly labeled partial result rather than presenting it as complete. Better
graph design or D3 layout does not itself make external APIs faster.

## Follow-up: graphics formats and D3

### SVG and print outputs

SVG (Scalable Vector Graphics) describes shapes, lines, and text as drawing
instructions rather than as a fixed grid of pixels. The vector elements can
remain sharp as the map is resized. An SVG can also contain book-cover or
portrait images, but these are normally raster images: enlarging an SVG does
not add detail to a low-resolution cover.

An approach to evaluate is composing the map with SVG or another
vector-capable renderer, then offering:

- **PDF for printing:** preserve vector lines and text where supported, while
  embedding cover and portrait images. Verify text handling, font embedding,
  accessibility, and actual print output.
- **PNG for sharing:** render at a suitable pixel size. For example, an
  8-by-10-inch image at 300 pixels per inch is 2,400 by 3,000 pixels.
- **JPEG where useful for smaller photo-heavy outputs:** compression can make
  small text and fine lines less crisp.

An SVG-based pipeline does not guarantee a vector PDF or accessible text;
those depend on the export implementation. Check the resolution of selected
images and consider warning when a cover may print poorly at the chosen size.

### Networks, trees, and layouts

D3 can work with **network graphs**, including many-to-many connections. An
author can connect to several books, a book can connect to several authors,
and books can share subjects. Shelf Thread already uses `d3-force` for its
interactive graph and React Native SVG to draw it; see
[graphLayout.ts](../apps/app/src/graphLayout.ts).

A tree is not limited to one child per parent: it supports one-to-many
branching. Its limitation is that each node in a tree has one parent. Showing
a book with multiple authors as a simple tree requires duplication or another
representation, so a tree should not silently omit real relationships.

Possible layouts for printable exports:

- **Force-directed network:** an organic constellation. D3's
  [force simulation](https://d3js.org/d3-force/simulation) is a starting point
  for positioning linked nodes. Print-specific tuning could emphasize the
  starting book and reserve space for images and labels.
- **Layered network:** a more ordered arrangement of authors, books, and
  subjects that still supports multiple connections. A specialized layout
  library or custom algorithm could calculate positions; D3 can help draw the
  result.
- **Tree or radial tree:** useful for a deliberately selected branching view,
  using [D3's tree layout](https://d3js.org/d3-hierarchy/tree), but not a
  substitute for the underlying many-to-many graph.
- **Sequential trail:** an intentional left-to-right or top-to-bottom
  arrangement is likely more readable than a force layout for an ordered
  journey. [D3 curves](https://d3js.org/d3-shape/curve) could draw gently
  curved threads between positions.

D3 does not automatically produce a finished, accessible print design. Its
[collision force](https://d3js.org/d3-force/collide) treats nodes as circles,
so rectangular covers and labels require additional measurement and overlap
handling. The export also needs relationship-label placement, page bounds,
minimum readable sizes, image handling, and actual print testing. Large static
layouts may need off-thread computation to keep the interface responsive,
using an appropriate approach for each platform.

A useful experiment would render the same small fictional data set as both a
constellation and a sequential trail, then compare them at actual print size.

## Follow-up: a trail of the reader's journey

The user proposed a feature that builds a breadcrumb-like trail as a reader
navigates through pages, which could then be turned into a printable creation.
Unlike the existing find-connection feature, which finds a path between items,
this would record the **path the reader actually took**.

For example:

```text
Book A -> its author -> another book by that author -> a subject -> Book B
```

A quiet "Your thread: 5 stops" indicator could open an ordered view with covers
and relationship labels. Readers could review, save, name, annotate, and edit
the trail before previewing a printable export. Keeping viewing and saving
free, with the illustrated export paid, is one possible freemium split.

Ordinary browsing history and a meaningful discovery trail are not necessarily
the same thing. Navigation through settings, a new unrelated search, using
Back, or following a different branch needs explicit product rules. One
possible starting approach is to record connected discovery steps only, treat
a new unrelated search as a potential new thread, and keep normal navigation
history separate. These behaviors remain open design choices.

Do not invent a relationship when an intermediate stop is removed or when two
visited pages are not actually connected. Show the gap, preserve enough
relationship information to explain each step, or ask the reader how to edit
it. The trail is a discovery artifact, not a reading-progress tracker.
