import { slugifySubject } from "@book-explorer/shared";
import { titleCase } from "./titleCase";

const parts = (label: string) => label.split(/\s*--\s*|\s*,\s*/).filter(Boolean).map(titleCase);

/** Display only: stored labels and slugs are untouched. */
export const subjectLabel = (label: string) => parts(label).join("->");

/** Screen readers read "->" badly. */
export const subjectSpokenLabel = (label: string) => parts(label).join(", ");

/** The chip's label has the separators the server's slug-derived name lacks. */
export const subjectDisplayName = (slug: string, serverName: string, label?: string) =>
  label && slugifySubject(label) === slug ? label : serverName;
