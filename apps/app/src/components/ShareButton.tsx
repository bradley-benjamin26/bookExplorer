import type { Href } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo, Platform, Share, Text } from "react-native";
import { shareFeedback, shareMessage } from "../share";
import { useTheme } from "../theme";
import { Button } from "./Button";

/** Resolves true when it copied to the clipboard instead of opening a share sheet. */
async function shareText(title: string, message: string): Promise<boolean> {
  if (Platform.OS !== "web") {
    await Share.share({ message });
  } else if (navigator.share) {
    await navigator.share({ title, text: message });
  } else {
    await navigator.clipboard.writeText(message);
    return true;
  }
  return false;
}

/** Shares an entity's deep link plus its Open Library page: native share sheet, Web Share API, or copy-to-clipboard on web browsers without it. */
export function ShareButton({ title, href, publicUrl }: { title: string; href: Href; publicUrl: string }) {
  const { colors } = useTheme();
  const [status, setStatus] = useState("");
  const share = async () => {
    const message = await shareFeedback(() => shareText(title, shareMessage(title, href, publicUrl)));
    setStatus(message);
    if (message && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  };
  return (
    <>
      <Button variant="pill" onPress={share} style={{ marginTop: 8 }} accessibilityLabel={`Share ${title}`}>
        Share
      </Button>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted }}>
        {status}
      </Text>
    </>
  );
}
