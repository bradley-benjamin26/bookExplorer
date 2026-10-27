import type { WorkRef } from "@book-explorer/shared";

/** Which screen Find Connection shows. `from` is the route param, set when launched from a work page. */
export function connectionStep(from: string | undefined, start: WorkRef | null, target: WorkRef | null): "pickStart" | "pickTarget" | "result" {
  if (!from && !start) return "pickStart";
  return target ? "result" : "pickTarget";
}
