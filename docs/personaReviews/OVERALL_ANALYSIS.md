# Persona Review — Overall Analysis

## Scope and evidence

Ten simulated persona reviews were completed against the questions in
[`../userQuestions.txt`](../userQuestions.txt). Each report follows the assigned
persona and includes its own assumptions:

- [P1 Maya](./P1_Maya.md)
- [P2 Dev](./P2_Dev.md)
- [P3 Jordan](./P3_Jordan.md)
- [P4 Dorothy](./P4_Dorothy.md)
- [P5 Sam](./P5_Sam.md)
- [P6 Marcus](./P6_Marcus.md)
- [P7 Rosa](./P7_Rosa.md)
- [P8 Alejandro](./P8_Alejandro.md)
- [P9 Henry](./P9_Henry.md)
- [P10 Priya](./P10_Priya.md)

This is a qualitative, simulated panel, not research with real users. Some
reviewers interacted with the local web app; others relied mostly or entirely
on source inspection. Native camera/scanner use, assistive-technology behavior,
offline operation, large-scale scanning, and export round-tripping were not
validated end to end. Treat source-derived concerns as hypotheses to test, not
as confirmed runtime defects.

Several reviewers independently encountered a `/` page titled “connection (1)”
instead of the expected home screen. An untracked duplicate route file exists
in the current working tree, and more than one reviewer explicitly could not
establish causation. This is a high-impact **environment/worktree anomaly to
reproduce in a clean checkout**, not yet a confirmed release defect. Preserve
the pre-existing untracked file while investigating it.

## Overall assessment

The app's strongest proposition is a visual, bookish way to explore works,
editions, authors, and subjects, with practical catalog links, local lists, and
notes. Reviewers who reached the relevant screens generally understood the
discovery concept and liked having multiple routes into a book. Several also
found useful records, saved items, or promising recommendations.

The main gap is between **rich catalog exploration** and **quick, trustworthy
book decisions**. New users can face search-mode and work/edition choices,
save-to-list steps, and large amounts of metadata before getting a simple
answer. Meanwhile, imperfect or opaque metadata weakens trust precisely where
edition identity, series order, creator credit, language, or subject relevance
matters.

## Findings and recommended priorities

### 1. Verify and stabilize first launch

The unexpected connection screen at `/` was reported by multiple browser
reviewers. If reproducible outside this modified local tree, it blocks the
primary entry point and should be fixed before other UX polish. Re-run the
first-launch flow in a clean checkout and on the supported web/native targets;
check route resolution and the initial navigation destination. Do not remove or
overwrite the untracked duplicate route without confirming its ownership and
purpose.

### 2. Make record identity and metadata more dependable

Observed examples included irrelevant or duplicate search results, repeated or
awkward descriptions, missing creator roles, weak series/volume identification,
edition pages with sparse identifying facts, and broad subject pages mixing
loosely related material. These issues particularly undermine comic-shop,
library, used-book inventory, and “what should I read next?” use cases.

Recommended next steps:

- Improve ranking and deduplication for title/author searches; make title,
  creator, and edition identity apparent in each result.
- Present work versus edition in plain language (for example, “All editions”
  and “This edition”), and keep ISBN, publisher, publication date, and format
  visible on the edition page when known.
- Show series position and role-specific creator credits when the source data
  supports them; avoid implying certainty when it does not.
- De-duplicate descriptions and provide a clear absence state when no useful
  summary is available.
- Explain broad subjects, distinguish related senses, and offer provenance or
  source details without forcing casual readers to see raw catalog jargon.
- Add language identification to edition choices so readers can select a
  translation confidently.

These are data-quality and presentation concerns, not proof that every record
is wrong. Validate with representative fiction, nonfiction, comics, translated
works, and older editions.

### 3. Shorten the path to saving and a useful first recommendation

The save flow commonly asks the user to select or create a list; editing terms
and notes may require saving first and then unlocking an editor. That level of
control suits power users, but it slows down people with short reading windows
or limited attention. Recommendations also depend on saved items, so a new
user may need to organize a library before receiving a useful suggestion.

Consider a one-tap default “Save for later” action, with list selection and
editing available as optional follow-ups. Make the save state and next step
clear, and offer a lightweight first recommendation based on an optional
interest selection before requiring a populated library. Preserve list-specific
organization for users who want it.

### 4. Set clear expectations for import/export and collection data

The power-user reviews emphasized that portability is a core promise, not a
secondary utility. Source review raised a concern that CSV export may not
preserve reading status, personal ratings, and shelf semantics as users expect.
Some reviewers saw export controls but did not download and round-trip a file,
so this needs direct verification.

Test representative Goodreads and StoryGraph files end to end. Map reading
status, rating, shelves, notes, identifiers, and dates explicitly where
supported; preview fields that cannot be preserved; and avoid success messaging
that suggests a lossless export when it is not. Keep JSON backup distinct from
portable CSV export in labels and explanations.

### 5. Validate accessibility with assistive technology, not source alone

The implementation appears to provide meaningful labels, headings, state
announcements, and a list alternative to the graph. That is a promising
foundation, but no report completed a real VoiceOver, NVDA, or TalkBack audit.
The visually central graph must not be a required path to the same information.

Run task-based tests on iOS VoiceOver, Android TalkBack, and web keyboard/NVDA.
Verify focus order, page headings, text-input names, save/error/scan
announcements, graph list size and navigation, touch targets, text scaling, and
contrast in both themes. Record actual spoken output and failures rather than
inferring accessibility from props in source.

### 6. Treat batch scanning as a distinct, reliability-critical workflow

Batch scanning is attractive across personas but serves incompatible contexts:
quiet one-handed use, accessible scanning, library intake, and fast dealer
inventory. Source-based review raised questions about crash recovery, offline
retry, duplicate copies, identification feedback, scanner input, and session
export. No 200–500-book run, physical scanner, or poor-network recovery test was
completed.

Before promoting this as a work-grade workflow, run a measured test with
camera and keyboard/Bluetooth input, interruptions, duplicate ISBNs, ISBN-10
including X, missing identifiers, network loss, restart/recovery, and export.
Persist accepted scans and distinguish “captured” from “identified” and
“failed.” Let users choose sound and haptics independently; one default cannot
suit a sleeping baby and a noisy basement.

### 7. Address Spanish-first and constrained-data needs

Spanish titles and accent-insensitive search worked for one reviewer's test
queries, but the interface and some metadata remained English-forward, and
edition language was not clear. The current review did not measure network
usage or test offline behavior on a budget Android device.

Prioritize explicit edition-language labels and translation links, then
Spanish-first search/interface options and text-first/data-saver controls.
Measure cover and prefetch traffic, offer Wi-Fi-only or opt-in image loading,
and verify offline access to deliberately saved records.

## Design tensions to preserve

These preferences cannot be resolved by choosing one persona's ideal as the
universal default:

- **Graph:** central exploration for Dev and Sam; optional discovery for Maya
  and Jordan; low priority for Dorothy and Henry; text/list access required for
  Marcus. Keep the graph discoverable but never mandatory.
- **Catalog terms:** Rosa needs authoritative headings and provenance; several
  casual readers find raw tags noisy; Marcus needs long lists grouped or
  collapsed. Provide plain-language presentation with provenance available
  on demand and a professional view for catalog users.
- **Control versus speed:** Sam and Henry want precise controls; Maya, Dorothy,
  Jordan, and Priya want sensible defaults. Make the quick path simple while
  retaining advanced controls behind deliberate affordances.
- **Privacy and sharing:** sharing is valuable for reading groups, but Rosa
  raises student privacy concerns and Dorothy is cautious. Make sharing
  explicit and opt-in; do not silently sync personal or student reading data.
- **Scanning feedback:** haptics/audio help Marcus and Henry, while Priya needs
  quiet use. Offer separate, configurable feedback modes.
- **Visual richness versus data use:** covers help Maya, Jordan, and Sam; they
  cost bandwidth for Alejandro. Allow image loading to be controlled without
  removing covers for everyone.

## Suggested validation sequence

1. Reproduce the root-route issue in a clean checkout and verify first launch.
2. Run moderated task tests for search → correct work → edition → save, with
   both casual readers and metadata-heavy users; include the problematic
   examples in the reports as test fixtures.
3. Perform real assistive-technology tests on the same core journeys, including
   a non-visual graph/list task.
4. Round-trip representative CSV imports and exports and document losses.
5. Test scanning reliability, recovery, feedback settings, and measured
   throughput on physical devices under good and poor connectivity.
6. Measure Spanish search, edition-language selection, data consumption, and
   saved-item offline use on a constrained Android device.

## Bottom line

Keep the connected-book discovery concept and its practical catalog links. The
highest-value work is to make the first launch reliable, make records easier to
trust, and offer a quick, accessible save/discovery path without removing the
depth that specialist users value. Treat this panel as a source of testable
hypotheses; use real users and device-level validation before making claims
about usability, accessibility, scanning reliability, or performance.
