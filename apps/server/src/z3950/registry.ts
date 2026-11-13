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
  lib("kcmo", "Kansas City", "kcmo.sirsi.net", 2500, "UNICORN"),
  lib("nwrls", "Northwest Regional Library System FL", "pac.nwrls.lib.fl.us", 5666, "LSPacZ"),
  lib("more", "MORE Libraries WI", "www.more.lib.wi.us", 210, "INNOPAC"),
  lib("oakland", "Oakland Public Library", "catalog.oaklandlibrary.org", 210, "INNOPAC"),
  lib("sacramento", "Sacramento Public Library", "www.saclibrarycatalog.org", 210, "INNOPAC"),
  lib("sfpl", "San Francisco Public Library", "sflib1.sfpl.org", 210, "INNOPAC"),
  lib("brooklyn", "Brooklyn Public Library", "catalog.brooklynpubliclibrary.org", 210, "INNOPAC"),
  lib("prospector", "Prospector (Colorado)", "prospector.coalliance.org", 210, "INNOPAC"),
  lib("ecpl", "East Chicago Public Library", "catalog.ecpl.org", 210, "INNOPAC"),
  lib("tulsa", "Tulsa City-County Library", "opac.tulsalibrary.org", 210, "INNOPAC"),
  lib("cals", "Central Arkansas Library System", "vera.cals.lib.ar.us", 210, "INNOPAC"),
];

export function getZ3950Library(id: string): Z3950Library | undefined {
  return Z3950_LIBRARIES.find((l) => l.id === id);
}
