import type { HoldingsFormat } from "./registry.js";

export type CopyStatus = "available" | "checkedOut" | "unavailable" | "unknown";
export interface Copy { branch: string; callNumber: string | null; status: CopyStatus; dueDate: string | null }

const POLARIS: Record<string, CopyStatus> = { In: "available", Out: "checkedOut", Held: "unavailable" };
const SIRSI: Record<string, CopyStatus> = { "ON-SHELF": "available", CHECKEDOUT: "checkedOut" };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Nov  27 2026" or "11/16/2026" to "2026-11-16"; null if unparseable. */
function isoDate(raw: string | undefined): string | null {
  const s = raw?.trim().replace(/\s+/g, " ");
  if (!s) return null;
  let y: string, m: number, d: string;
  const a = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const b = /^([A-Za-z]{3})[a-z]* (\d{1,2}) (\d{4})$/.exec(s);
  if (a) [m, d, y] = [Number(a[1]), a[2], a[3]];
  else if (b) [m, d, y] = [MONTHS.indexOf(b[1].toLowerCase()) + 1, b[2], b[3]];
  else return null;
  if (m < 1 || m > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function subfields(rest: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of rest.split(" $").map((p, i) => (i === 0 ? p.replace(/^\$/, "") : p))) {
    if (part) out[part[0]] ??= part.slice(1).trim();
  }
  return out;
}

/** Scans yaz-client's printed MARC lines (`852    $a ... $b ...`); not an ISO 2709 reader. */
export function parseRecord(output: string, format: HoldingsFormat): { found: boolean; copies: Copy[] } {
  const lines = output.split("\n");
  const found = lines.some((l) => /Record type/.test(l) || /^\d{3} /.test(l));
  const tag = format === "polaris852" ? "852" : format === "sirsi926" ? "926" : null;
  const copies: Copy[] = [];
  for (const line of lines) {
    if (!tag || !line.startsWith(`${tag} `)) continue;
    const f = subfields(line.slice(3).replace(/^[^$]*/, ""));
    if (format === "polaris852") {
      copies.push({ branch: f.a ?? "", callNumber: f.h || null, status: POLARIS[f.r] ?? "unknown", dueDate: isoDate(f.u) });
    } else {
      const status = SIRSI[f.b] ?? "unknown";
      copies.push({ branch: f.a ?? "", callNumber: f.c || null, status, dueDate: status === "checkedOut" ? isoDate(f.e) : null });
    }
  }
  return { found, copies };
}
