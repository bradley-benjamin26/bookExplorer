import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { Pressable } from "react-native";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";
import { Button } from "./Button";

/** Header button on every screen but Home, so switching to a different book/author/subject doesn't require backing out through the whole navigation stack. `iconOnly` keeps the header from truncating titles. */
export function NewSearchButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const open = () => router.replace("/");
  if (iconOnly) {
    return (
      <Pressable
        ref={titleRef("New search")}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="New search"
        style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
          { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
          pressed && { opacity: 0.6 },
          // RN Web only; same focus ring as Button.
          focused && { outlineWidth: 2, outlineColor: theme.colors.cover, outlineStyle: "solid" as const },
        ]}
      >
        <Search size={20} color={theme.colors.ink} />
      </Pressable>
    );
  }
  return (
    <Button variant="pill" onPress={open} tooltip="New search">
      New Search
    </Button>
  );
}
