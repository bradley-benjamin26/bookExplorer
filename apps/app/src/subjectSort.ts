export type SubjectSort = "readinglog" | "rating" | "new" | "classic";

export const SUBJECT_SORTS: { value: SubjectSort; label: string }[] = [
  { value: "readinglog", label: "Most read" },
  { value: "rating", label: "Top rated" },
  { value: "new", label: "Newest" },
  { value: "classic", label: "Classic" },
];

export const DEFAULT_SUBJECT_SORT: SubjectSort = "readinglog";

/** Search params for a sorted subject listing; null for "classic", which keeps the subject's own order. */
export function subjectSortParams(subjectName: string, sort: SubjectSort): Record<string, string> | null {
  return sort === "classic" ? null : { subject: subjectName, sort };
}

/** Books to show for a sorted listing; falls back to the subject's own list when the sorted query errored or came back empty. */
export function booksForSort<T>(sortedActive: boolean, sorted: { data?: T[]; isError: boolean }, fallback: T[]): { books: T[]; fellBack: boolean } {
  if (!sortedActive) return { books: fallback, fellBack: false };
  if (sorted.isError || !sorted.data?.length) return { books: fallback, fellBack: sorted.isError };
  return { books: sorted.data, fellBack: false };
}
