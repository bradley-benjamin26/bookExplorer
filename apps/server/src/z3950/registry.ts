export type HoldingsFormat = "polaris852" | "sirsi926" | "none";

export interface Z3950Library {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  holdings: HoldingsFormat;
  /** The book's page in the library's web catalog, when it has one we can link to by ISBN. */
  recordUrl?: (isbn: string) => string;
}

const lib = (id: string, name: string, host: string, port: number, database: string, holdings: HoldingsFormat = "none", recordUrl?: (isbn: string) => string): Z3950Library =>
  ({ id, name, host, port, database, holdings, recordUrl });

// Display names are guesses from hostnames and are unconfirmed.
export const Z3950_LIBRARIES: readonly Z3950Library[] = [
  // An ISBN search with one hit redirects to the record's page.
  lib("kcmo", "Kansas City", "kcmo.sirsi.net", 2500, "UNICORN", "sirsi926", (isbn) => `https://kcmo.ent.sirsi.net/client/en_US/default/search/results?qu=${isbn}`),
];

export function getZ3950Library(id: string): Z3950Library | undefined {
  return Z3950_LIBRARIES.find((l) => l.id === id);
}
