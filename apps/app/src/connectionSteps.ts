/** A picked end of a connection: a graph node id ("work:OL1W", "author:OL2A") and its display name. */
export type Endpoint = { id: string; label: string };

/** Which screen Find Connection shows. `from` is the route param, set when launched from a work page. */
export function connectionStep(from: string | undefined, start: Endpoint | null, target: Endpoint | null): "pickStart" | "pickTarget" | "result" {
  if (!from && !start) return "pickStart";
  return target ? "result" : "pickTarget";
}
