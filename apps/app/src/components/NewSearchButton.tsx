import { useRouter } from "expo-router";
import { Button } from "./Button";

/** Header button on every screen but Home, so switching to a different book/author/subject doesn't require backing out through the whole navigation stack. */
export function NewSearchButton() {
  const router = useRouter();
  return (
    <Button variant="pill" onPress={() => router.replace("/")}>
      New Search
    </Button>
  );
}
