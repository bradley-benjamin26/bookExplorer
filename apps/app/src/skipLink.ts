export const skipTargetId = (name: string) => `skip-target-${name.trim().replace(/\s+/g, "-").toLowerCase()}`;

type Target = { focus(): void; scrollIntoView?(): void; getClientRects?(): ArrayLike<unknown> };

/** Several screens can stay mounted (display: none) with the same id, so pick the visible one, preferring the one after the link. */
export function focusSkipTarget(
  id: string,
  doc: { querySelectorAll(selector: string): ArrayLike<Target> },
  from?: { compareDocumentPosition(other: never): number },
): boolean {
  // Ids come from skipTargetId, so only [a-z0-9-] reach the quoted selector.
  const visible = Array.from(doc.querySelectorAll(`[id="${id}"]`)).filter((t) => (t.getClientRects?.().length ?? 1) > 0);
  const after = from && visible.find((t) => from.compareDocumentPosition(t as never) & 4); // DOCUMENT_POSITION_FOLLOWING
  const el = after ?? visible[0];
  if (!el) return false;
  el.focus();
  el.scrollIntoView?.();
  return true;
}
