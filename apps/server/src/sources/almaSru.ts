import { normalizeIsbn, toAlternateIsbn, type LibraryAvailability } from "@book-explorer/shared";
import { fetchWithTimeout, UpstreamUnavailableError } from "../httpClient.js";
import { decodeXmlEntities } from "./loc.js";
import { USER_AGENT } from "./openLibrary.js";

/** An Ex Libris Alma catalog searched over SRU; MARCXML records carry Alma's AVA availability fields. */
export interface AlmaLibrary {
  id: string;
  name: string;
  sruUrl: string;
  recordUrl: (mmsId: string) => string;
}

export const ALMA_LIBRARIES: readonly AlmaLibrary[] = [
  {
    id: "umd",
    name: "University of Maryland Libraries",
    // Documented at https://opendata.lib.umd.edu/services/umd-discover/
    sruUrl: "https://usmai-umcp.alma.exlibrisgroup.com/view/sru/01USMAI_UMCP",
    recordUrl: (mms) => `https://usmai-umcp.primo.exlibrisgroup.com/discovery/fulldisplay?docid=alma${mms}&vid=01USMAI_UMCP:DEFAULT`,
  },
];

export const getAlmaLibrary = (id: string): AlmaLibrary | undefined => ALMA_LIBRARIES.find((l) => l.id === id);

type Result = Omit<LibraryAvailability, "level">;

const RECORD_RE = /<record xmlns="http:\/\/www\.loc\.gov\/MARC21\/slim">([\s\S]*?)<\/record>/g;
const datafields = (record: string, tag: string) => record.matchAll(new RegExp(`<datafield\\b[^>]*tag="${tag}"[^>]*>([\\s\\S]*?)</datafield>`, "g"));
const SUBFIELD_RE = /<subfield code="(.)">([^<]*)<\/subfield>/g;
const MMS_RE = /<controlfield tag="001">([^<]+)<\/controlfield>/;

function subfields(body: string): Record<string, string> {
  const f: Record<string, string> = {};
  for (const [, code, value] of body.matchAll(SUBFIELD_RE)) f[code] ??= decodeXmlEntities(value).trim();
  return f;
}

/**
 * Records whose 020 $a carries this ISBN (either form), so loose index matches are dropped:
 * alma.isbn also hits cancelled ISBNs in 020 $z (a made-up 978-0000000002 matched "0000000000 $17.50").
 * Copies: AVA is per holding, with $f items in all and $g of them unavailable, so one copy per item.
 * $q library, $c location, $d call number, $e "available" / "unavailable" / "check_holdings".
 */
export function parseAlmaResponse(xml: string, isbn: string, recordUrl: AlmaLibrary["recordUrl"]): Result {
  if (!/<numberOfRecords>\d+<\/numberOfRecords>/.test(xml)) throw new Error("Alma SRU response has no numberOfRecords");
  const wanted = new Set([isbn, toAlternateIsbn(isbn)]);
  const records = [...xml.matchAll(RECORD_RE)]
    .map(([, r]) => r)
    .filter((r) => [...datafields(r, "020")].some(([, body]) => wanted.has(normalizeIsbn(subfields(body).a?.split(" ")[0] ?? ""))));
  if (records.length === 0) return { found: false, copies: [], recordUrl: null };
  const copies: Result["copies"] = [];
  for (const record of records) {
    for (const [, body] of datafields(record, "AVA")) {
      const f = subfields(body);
      const branch = [f.q, f.c].filter(Boolean).join(", ");
      const callNumber = f.d || null;
      const total = Number(f.f);
      const out = Number(f.g);
      if (Number.isInteger(total) && total > 0 && Number.isInteger(out) && out >= 0 && out <= total) {
        for (let i = 0; i < total; i++) copies.push({ branch, callNumber, status: i < total - out ? "available" : "unavailable", dueDate: null });
      } else {
        copies.push({ branch, callNumber, status: f.e === "available" ? "available" : f.e === "unavailable" ? "unavailable" : "unknown", dueDate: null });
      }
    }
  }
  const mms = MMS_RE.exec(records[0])?.[1];
  return { found: true, copies, recordUrl: mms ? recordUrl(mms) : null };
}

export async function searchAlmaByIsbn(library: AlmaLibrary, isbn: string): Promise<Result> {
  const q = new URLSearchParams({ version: "1.2", operation: "searchRetrieve", query: `alma.isbn=${isbn}`, recordSchema: "marcxml", maximumRecords: "5" });
  const res = await fetchWithTimeout(`${library.sruUrl}?${q}`, { headers: { "User-Agent": USER_AGENT } });
  // A 5xx left after fetchWithTimeout's retries is a catalog outage, which the route answers with a 503.
  if (!res.ok) throw new UpstreamUnavailableError(new URL(library.sruUrl).hostname, 60_000);
  return parseAlmaResponse(await res.text(), isbn, library.recordUrl);
}
