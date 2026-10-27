import { subjectKey } from "@book-explorer/shared";

export type Terms = { subjects: string[]; genres: string[] };

/** `list` with `value` appended, trimmed; a blank or a near-duplicate of a term already there is skipped. */
export function addTerm(list: string[], value: string): string[] {
  const term = value.trim();
  if (!term || list.some((t) => subjectKey(t) === subjectKey(term))) return list;
  return [...list, term];
}

export function removeTerm(list: string[], value: string): string[] {
  return list.filter((t) => t !== value);
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

/** Whether an unlocked draft has edits the saved record doesn't have yet. */
export function draftChanged(draft: Terms, record: Terms): boolean {
  return !sameList(draft.subjects, record.subjects) || !sameList(draft.genres, record.genres);
}
