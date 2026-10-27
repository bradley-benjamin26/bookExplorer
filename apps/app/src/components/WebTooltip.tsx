import { useEffect, useRef, useState } from "react";
import { Platform, Text } from "react-native";
import { useTheme } from "../theme";
import { TOOLTIP_DELAY_MS, tooltipPosition } from "../webTitle";

type Tip = { text: string; target: DOMRect };

/** Web-only hover/focus tooltip for every element marked by `titleRef` (`data-tooltip`). */
export function WebTooltip() {
  if (Platform.OS !== "web") return null;
  return <WebTooltipInner />;
}

function WebTooltipInner() {
  const { colors, radii, typeScale, fonts } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const tipEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Element | null = null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
      setPos(null);
    };
    const start = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
      if (!el || el === current) return;
      hide();
      current = el;
      timer = setTimeout(() => setTip({ text: el.getAttribute("data-tooltip") ?? "", target: el.getBoundingClientRect() }), TOOLTIP_DELAY_MS);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "mouse") start(e);
    };
    const onOut = (e: PointerEvent) => {
      if (current && !current.contains(e.relatedTarget as Node | null)) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", start);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", start);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Measure the rendered tip (hidden until placed) to position it.
  useEffect(() => {
    if (!tip || !tipEl.current) return;
    const { width, height } = tipEl.current.getBoundingClientRect();
    const { x, y, width: w, height: h } = tip.target;
    setPos(tooltipPosition({ x, y, width: w, height: h }, { width, height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [tip]);

  if (!tip) return null;
  return (
    <Text
      ref={(el) => {
        tipEl.current = el as unknown as HTMLElement | null;
      }}
      role="tooltip"
      style={{
        position: "fixed" as "absolute",
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        opacity: pos ? 1 : 0,
        maxWidth: 240,
        padding: 6,
        pointerEvents: "none",
        zIndex: 1000,
        color: colors.ink,
        backgroundColor: colors.paper,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radii.sm,
        fontSize: typeScale.xs,
        fontFamily: fonts.body,
      }}
    >
      {tip.text}
    </Text>
  );
}
