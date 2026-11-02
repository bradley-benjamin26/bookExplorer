import { useRouter } from "expo-router";
import { CircleHelp } from "lucide-react-native";
import { Pressable } from "react-native";
import { routes } from "../navigation";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";

/** Small "?" header button that opens the About page. */
export function AboutButton() {
  const router = useRouter();
  const theme = useTheme();
  const open = () => router.push(routes.about());
  return (
    <Pressable
      ref={titleRef("About Shelf Thread")}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel="About Shelf Thread"
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
        pressed && { opacity: 0.6 },
        // RN Web only; same focus ring as Button.
        focused && { outlineWidth: 2, outlineColor: theme.colors.cover, outlineStyle: "solid" as const },
      ]}
    >
      <CircleHelp size={16} color={theme.colors.ink} />
    </Pressable>
  );
}
