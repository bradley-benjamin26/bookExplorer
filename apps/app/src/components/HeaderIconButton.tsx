import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";

/** A 44px icon button for the header; the label doubles as the tooltip and accessibility name. */
export function HeaderIconButton({ label, Icon, onPress }: { label: string; Icon: LucideIcon; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      ref={titleRef(label)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
        pressed && { opacity: 0.6 },
        // RN Web only; same focus ring as Button.
        focused && { outlineWidth: 3, outlineOffset: 2, outlineColor: theme.colors.focus, outlineStyle: "solid" as const },
      ]}
    >
      <Icon size={20} color={theme.colors.ink} />
    </Pressable>
  );
}
