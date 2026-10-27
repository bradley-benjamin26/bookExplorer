/** How long a hover or focus rests on a control before its tip shows. */
export const TOOLTIP_DELAY_MS = 500;

/** Callback ref that marks a control for WebTooltip. React Native Web host nodes are DOM elements; native nodes lack `setAttribute`, so this is a no-op there. Not `title`: the browser's own tooltip is slow and would show as well. */
export const titleRef = (text: string | undefined) => (el: unknown) => {
  const node = el as Element | null;
  if (text && typeof node?.setAttribute === "function") node.setAttribute("data-tooltip", text);
  else if (!text && typeof node?.removeAttribute === "function") node.removeAttribute("data-tooltip");
};

type Size = { width: number; height: number };

/** Tip goes 6px below the target, centred and kept 8px inside the viewport; flips above when there is no room below. */
export function tooltipPosition(target: Size & { x: number; y: number }, tip: Size, viewport: Size): { left: number; top: number } {
  const gap = 6;
  const edge = 8;
  const left = Math.max(edge, Math.min(target.x + target.width / 2 - tip.width / 2, viewport.width - edge - tip.width));
  const below = target.y + target.height + gap;
  const top = below + tip.height + edge > viewport.height ? target.y - gap - tip.height : below;
  return { left, top };
}

/** What WebTooltip does for an event. `pressed` is true from a pointer press until the next keypress: the focus a click causes must not re-arm the tip. */
export function tooltipAction(
  event: "pointerover" | "focusin" | "pointerdown" | "escape",
  { pointerType, pressed }: { pointerType?: string; pressed?: boolean } = {}
): "show" | "hide" | "ignore" {
  if (event === "pointerdown" || event === "escape") return "hide";
  if (event === "pointerover") return pointerType === "mouse" ? "show" : "ignore";
  return pressed ? "ignore" : "show";
}
