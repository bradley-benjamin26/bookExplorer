import { useRouter } from "expo-router";
import { Library } from "lucide-react-native";
import { Pressable } from "react-native";
import { routes } from "../navigation";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";
import { Button } from "./Button";

/** Header button on every screen but My Library itself, so the saved list is always one tap away. `iconOnly` keeps the header from truncating titles. */
export function MyLibraryButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const open = () => router.push(routes.saved());
  if (iconOnly) {
    return (
      <Pressable
        ref={titleRef("My Library")}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="My Library"
        style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
          { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
          pressed && { opacity: 0.6 },
          // RN Web only; same focus ring as Button.
          focused && { outlineWidth: 2, outlineColor: theme.colors.cover, outlineStyle: "solid" as const },
        ]}
      >
        <Library size={20} color={theme.colors.ink} />
      </Pressable>
    );
  }
  return (
    <Button variant="pill" onPress={open} tooltip="My Library">
      My Library
    </Button>
  );
}
