export interface HomeThread {
  id: string;
  author: { id: string; name: string };
  work: { id: string; title: string };
  subject: { slug: string; label: string };
}

// Real threads: each work is by that author and lists that subject on Open Library (checked 2026-11-12).
// shortcut: six prepared threads, add more here when readers see repeats.
export const HOME_THREADS: readonly HomeThread[] = [
  { id: "le-guin", author: { id: "OL31353A", name: "Ursula K. Le Guin" }, work: { id: "OL59800W", title: "The Left Hand of Darkness" }, subject: { slug: "science_fiction", label: "Science fiction" } },
  { id: "butler", author: { id: "OL30802A", name: "Octavia E. Butler" }, work: { id: "OL35616W", title: "Kindred" }, subject: { slug: "time_travel", label: "Time travel" } },
  { id: "morrison", author: { id: "OL31120A", name: "Toni Morrison" }, work: { id: "OL50548W", title: "Beloved" }, subject: { slug: "historical_fiction", label: "Historical fiction" } },
  { id: "pratchett", author: { id: "OL25712A", name: "Terry Pratchett" }, work: { id: "OL453735W", title: "Guards! Guards!" }, subject: { slug: "fantasy", label: "Fantasy" } },
  { id: "shelley", author: { id: "OL25342A", name: "Mary Shelley" }, work: { id: "OL450063W", title: "Frankenstein; or, The Modern Prometheus" }, subject: { slug: "epistolary_fiction", label: "Epistolary fiction" } },
  { id: "clarke", author: { id: "OL1387961A", name: "Susanna Clarke" }, work: { id: "OL5703422W", title: "Jonathan Strange and Mr. Norrell" }, subject: { slug: "magic", label: "Magic" } },
];

/** A random thread, never the one with id `exclude` (so a returning reader sees a new one). */
export function pickThread(random: () => number = Math.random, exclude?: string): HomeThread {
  const pool = HOME_THREADS.length > 1 ? HOME_THREADS.filter((t) => t.id !== exclude) : HOME_THREADS;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
