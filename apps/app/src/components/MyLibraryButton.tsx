import { useRouter } from "expo-router";
import { Library } from "lucide-react-native";
import { Pressable } from "react-native";
import { routes } from "../navigation";
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
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="My Library"
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Library size={20} color={theme.colors.ink} />
      </Pressable>
    );
  }
  return (
    <Button variant="pill" onPress={open}>
      My Library
    </Button>
  );
}
