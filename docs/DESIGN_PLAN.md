# Book Explorer — Visual Design Plan

Status: implemented across all screens (Home and BookDetail first, then the rest in a follow-up pass). Not yet reviewed visually in light and dark.

## Brief (why this direction)

Book Explorer is for a reader standing in front of their own shelf: they pick up a book,
scan it, and want to follow a thread — same author, same subject, same genre — to find
what to read next. It's not a reading tracker, not a social app, not something opened
daily. It's a reliable tool used in the moment, like a friend pointing at a connection.
The **graph explorer is the core feature**; everything else should feel one tap away from
"see how this connects." The experience needs to stay breezy by default, with real
bibliographic depth available to anyone who taps further — never forced on everyone.

Concept: **marginalia** — the handwritten notes, underlines, and connecting lines a reader
leaves in a book. The author/subject/genre graph is that marginalia made visible. Scanning a
book is like opening to a page someone's already annotated.

## Design tokens

### Color

Light:
| token | hex | use |
|---|---|---|
| `paper` | `#FAF7F0` | background |
| `ink` | `#1F2430` | primary text |
| `inkFaint` | `#8B8A94` | secondary/muted text |
| `cover` | `#2B5951` | primary accent — CTAs, scan action, active graph node |
| `coverLight` | `#E4ECE7` | tint of cover for chips/backgrounds |
| `marginalia` | `#C0572E` | secondary accent — saved state, graph highlight only |
| `thread` | `#8A94A8` | graph edges/connecting lines, dividers that echo the graph motif |

Dark (hand-tuned, not inverted — follow the existing app's precedent in `theme.ts`):
| token | hex |
|---|---|
| `paper` | `#191B20` |
| `ink` | `#EDEAE2` |
| `cover` | `#6FA897` |
| `marginalia` | `#E08662` |
| `thread` | keep close to light value, verify contrast on dark paper |

Rules:
- `cover` carries all primary action. `marginalia` is reserved for "this is yours" (saved)
  and graph highlights — never used as decoration or on more than one element per screen.
- Do not reintroduce the generic AI cream (`#F4F1EA`) or terracotta (`#D97757`) — `paper`
  and `marginalia` are deliberately off those exact values.

### Type

- Display/headline: **Fraunces** (variable serif, soft optical-size axis), weight 500–600.
  Used for screen titles, book/author/work names, section headers. No single-word
  italic/bold/color accents within a headline.
- UI/body: **Inter** (or **Public Sans** — pick one, don't mix) for body text, labels,
  buttons, metadata, chip text.
- Load both via `expo-font` / `useFonts` (currently zero custom fonts in the app — see
  `apps/app/src/theme.ts` and grep results, nothing to migrate away from, just add).
- Scale (~1.25 ratio): 13 / 16 / 20 / 25 / 31 / 39.
  - Body text: 16px, line-height 1.5.
  - Serif headlines: slightly more line-height than the sans scale when they wrap.
- Retire the uppercase tracked-out "kicker" label (`theme.ts` `kicker` style) as the
  *universal* section-header device — it's overused today (About, Subjects, Genre, Format,
  Reviews, Find This Book, etc. all use it). Replace section headers with serif headline
  type at a small size instead. Keep uppercase+tracking only for true taxonomy chips
  (genre/subject/format tags), where it's actually load-bearing information, not decoration.

### Layout

- Left-align content on BookDetail/WorkDetail (currently centered — see
  `apps/app/app/book/[isbn].tsx`). Matches AuthorDetail/SubjectDetail, which are already
  left-aligned. Reads as "a page," not "a poster."
- Home: two clear entry points, not stacked-buttons-with-an-"or"-divider. Scan is the
  primary, tactile action (pull-phone-out moment) — give it more visual weight than Search.
- Keep single-column, ~70-char line length, generous whitespace on detail screens.
  Depth stays behind existing collapse/expand affordances (`ExpandableText`, collapsible
  sections) — never more than one tap deep.
- Let the graph's thread/node motif (thin connecting line + small circular node) echo
  subtly elsewhere: as a divider style, a loading state, or a small "related" preview
  hinting at the graph from BookDetail before the user taps in. Don't overdo this —
  one quiet recurrence is enough, not a motif slapped on every screen.

ASCII — Home (target shape):
```
 Book Explorer
 find your next read

 ┌─────────────────────────────┐
 │   ◎  Scan a book            │   <- cover-green, primary, tactile
 └─────────────────────────────┘

 Search by title or author  ⌕
 ──────────────────────────────

 Recently looked at
 ⸬ The Left Hand of Darkness
 ⸬ Borges — Ficciones
```

### Icons

Replace the current Unicode-glyph-as-icon approach (›, ★, ☆, ‹, ⌄, ⚠, + as literal `Text`
characters — see `WorkListRow`, `ErrorState`, `LibraryFindLinks`, etc.) with a real
thin-stroke icon set, e.g. `lucide-react-native`. Use sparingly — most of the app's
"icon" needs are chevrons/stars/warnings, so this is a small, contained swap, not a new
visual language.

## Principles (hold the line on these during implementation)

1. The graph is the main character. Other screens gesture toward it; they don't compete
   with it.
2. Breezy by default, deep on request. First view of any screen is calm and short.
3. One accent, used with restraint. `cover` for action, `marginalia` only for "yours" or
   a graph highlight — never both prominent on the same screen.
4. No chrome for chrome's sake. Kill: uppercase-kicker-everywhere, duplicate pill-button
   styles (`MyLibraryButton` vs `NewSearchButton` currently duplicate the same style
   object), Unicode-glyph icons.

## Implementation notes / current-state references

From the codebase audit (apps/app):

- Theme source of truth: `apps/app/src/theme.ts` — `ThemeColors`, `spacing`, `radii`,
  `ThemeProvider`, `useTheme`. Add the new tokens here; keep the existing
  light/dark-switching mechanism (`useThemePreference`, `ThemePreference` in
  `apps/app/src/storage/themePreference.ts`) — it already works, don't rebuild it.
- `spacing`/`radii` scales exist but are only consumed by `Button.tsx` and the two header
  pill buttons today — most screens hardcode raw pixel values in their own
  `StyleSheet.create`. When touching Home/BookDetail, migrate their styles onto the
  theme scale rather than adding more hardcoded numbers.
- `app.json` forces `"userInterfaceStyle": "light"` at the native level even though the
  JS theme supports dark — leave as-is unless the user asks to fix it separately (noted
  here so it isn't mistaken for a bug introduced by this redesign).
- No design/brand docs existed before this file — this is the first one.

## Rollout

1. Land token updates in `theme.ts` (new colors, font family refs, scale) without changing
   any screen yet — verify both light and dark render with real screens still on old
   styles (should look unchanged, since nothing consumes the new tokens yet).
2. Load Fraunces + Inter via `expo-font`/`useFonts`; add a loading gate if needed.
3. Redesign **Home** (`apps/app/app/index.tsx`): scan-primary layout, serif title, new
   divider/entry treatment, migrate hardcoded spacing to theme scale.
4. Redesign **BookDetail** (`apps/app/app/book/[isbn].tsx`): left-align, serif headlines
   replacing kicker labels for section headers, keep taxonomy chips' uppercase+tracking,
   swap Unicode icons for the icon set in this screen's chevron rows.
5. Screenshot/review both screens in light and dark before deciding whether to continue
   the rollout to the remaining screens (Search, Saved, AuthorDetail, WorkDetail,
   SubjectDetail, GraphExplorer) in a follow-up pass.
