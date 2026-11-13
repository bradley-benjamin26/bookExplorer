import type { HoldingsFormat } from "./registry.js";

export type CopyStatus = "available" | "checkedOut" | "unavailable" | "unknown";
export interface Copy { branch: string; callNumber: string | null; status: CopyStatus; dueDate: string | null }

const POLARIS: Record<string, CopyStatus> = { In: "available", Out: "checkedOut", Held: "unavailable" };
const SIRSI: Record<string, CopyStatus> = { "ON-SHELF": "available", CHECKEDOUT: "checkedOut" };

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
      copies.push({ branch: f.a ?? "", callNumber: f.h || null, status: POLARIS[f.r] ?? "unknown", dueDate: f.u || null });
    } else {
      const status = SIRSI[f.b] ?? "unknown";
      copies.push({ branch: f.a ?? "", callNumber: f.c || null, status, dueDate: status === "checkedOut" ? f.e || null : null });
    }
  }
  return { found, copies };
}
