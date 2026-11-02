import type { ThemeColors } from "./themeColors";

/** Tint for a list row while pressed or hovered (pressed wins); undefined when idle. */
export function rowFeedback(
  colors: Pick<ThemeColors, "pressedBackground" | "hoverBackground">,
  state: { pressed: boolean; hovered?: boolean }
): { backgroundColor: string } | undefined {
  if (state.pressed) return { backgroundColor: colors.pressedBackground };
  if (state.hovered) return { backgroundColor: colors.hoverBackground };
  return undefined;
}
