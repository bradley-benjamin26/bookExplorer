export const skipTargetId = (name: string) => `skip-target-${name.trim().replace(/\s+/g, "-").toLowerCase()}`;

type Focusable = { focus(): void; scrollIntoView?(): void };

export function focusSkipTarget(id: string, doc: { getElementById(id: string): Focusable | null }): boolean {
  const el = doc.getElementById(id);
  if (!el) return false;
  el.focus();
  el.scrollIntoView?.();
  return true;
}
