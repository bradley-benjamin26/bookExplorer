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
