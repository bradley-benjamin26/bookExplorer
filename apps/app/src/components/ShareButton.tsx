import type { Href } from "expo-router";
import { Platform, Share } from "react-native";
import { shareMessage } from "../share";
import { Button } from "./Button";

async function shareText(title: string, message: string) {
  if (Platform.OS !== "web") {
    await Share.share({ message });
  } else if (navigator.share) {
    await navigator.share({ title, text: message });
  } else {
    await navigator.clipboard.writeText(message);
  }
}

/** Shares an entity's deep link plus its Open Library page: native share sheet, Web Share API, or copy-to-clipboard on web browsers without it. */
export function ShareButton({ title, href, publicUrl }: { title: string; href: Href; publicUrl: string }) {
  return (
    <Button
      variant="pill"
      // A dismissed share sheet rejects on web (AbortError); nothing to report.
      onPress={() => shareText(title, shareMessage(title, href, publicUrl)).catch(() => {})}
      style={{ marginTop: 8 }}
      accessibilityLabel={`Share ${title}`}
    >
      Share
    </Button>
  );
}
