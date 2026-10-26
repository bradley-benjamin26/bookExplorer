import { useRouter } from "expo-router";
import { routes } from "../navigation";
import { Button } from "./Button";

/** Header button on every screen but My Library itself, so the saved list is always one tap away. */
export function MyLibraryButton() {
  const router = useRouter();
  return (
    <Button variant="pill" onPress={() => router.push(routes.saved())}>
      My Library
    </Button>
  );
}
