export type HoldingsFormat = "polaris852" | "sirsi926" | "none";

export interface Z3950Library {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  holdings: HoldingsFormat;
}

const lib = (id: string, name: string, host: string, port: number, database: string, holdings: HoldingsFormat = "none"): Z3950Library =>
  ({ id, name, host, port, database, holdings });

// Display names are guesses from hostnames and are unconfirmed.
export const Z3950_LIBRARIES: readonly Z3950Library[] = [
  lib("mbln", "Metropolitan Boston Library Network", "catalog.mbln.org", 210, "pac", "polaris852"),
  lib("kcmo", "Kansas City", "kcmo.sirsi.net", 2500, "UNICORN", "sirsi926"),
];

export function getZ3950Library(id: string): Z3950Library | undefined {
  return Z3950_LIBRARIES.find((l) => l.id === id);
}
