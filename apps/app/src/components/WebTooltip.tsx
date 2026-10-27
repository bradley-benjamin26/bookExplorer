import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Text } from "react-native";
import { useTheme } from "../theme";
import { TOOLTIP_DELAY_MS, tooltipAction, tooltipPosition } from "../webTitle";

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
    let pressed = false;
    // keepCurrent: after a press the control stays "current", so moving over its children doesn't re-arm the tip.
    const hide = (keepCurrent = false) => {
      clearTimeout(timer);
      if (!keepCurrent) current = null;
      setTip(null);
      setPos(null);
    };
    const start = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
      if (!el || el === current) return;
      hide();
      current = el;
      timer = setTimeout(() => {
        // A click may have removed the control (navigation) before the delay ended.
        if (el.isConnected) setTip({ text: el.getAttribute("data-tooltip") ?? "", target: el.getBoundingClientRect() });
      }, TOOLTIP_DELAY_MS);
    };
    const onOver = (e: PointerEvent) => {
      if (tooltipAction("pointerover", { pointerType: e.pointerType }) === "show") start(e);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (tooltipAction("focusin", { pressed }) === "show") start(e);
    };
    const onDown = () => {
      pressed = true;
      if (tooltipAction("pointerdown") === "hide") hide(true);
    };
    const onFocusOut = () => hide();
    const onOut = (e: PointerEvent) => {
      if (current && current.contains(e.target as Node) && !current.contains(e.relatedTarget as Node | null)) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      pressed = false;
      if (e.key === "Escape" && tooltipAction("escape") === "hide") hide();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("scroll", onFocusOut, true);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("scroll", onFocusOut, true);
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
  // Portalled to <body> and above RN Web's Modal (zIndex 9999), so tips inside sheets show.
  const { createPortal } = require("react-dom") as { createPortal: (node: ReactNode, to: Element) => ReactNode }; // no @types/react-dom
  return createPortal(
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
        zIndex: 100000,
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
    </Text>,
    document.body
  );
}
