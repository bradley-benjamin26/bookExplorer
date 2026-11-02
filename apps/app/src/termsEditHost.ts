export type EditLinkHost = "genres" | "subjects" | "standalone";

/** Which section carries the Edit/Save link; stays on genres while editing so Save doesn't jump. */
export function editLinkHost(genres: string[], subjects: string[], unlocked: boolean): EditLinkHost {
  if (unlocked || genres.length > 0) return "genres";
  return subjects.length > 0 ? "subjects" : "standalone";
}
