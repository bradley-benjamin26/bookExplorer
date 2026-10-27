import type { Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Share, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { WEB_ORIGIN, shareFeedback, webUrl } from "../share";
import { useTheme } from "../theme";
import { Button } from "./Button";

/** Resolves true when it copied to the clipboard instead of opening a share sheet. */
async function shareLink(title: string, url: string): Promise<boolean> {
  if (Platform.OS !== "web") {
    // iOS shows `message` and `url` both, so send only one per platform.
    await Share.share(Platform.OS === "ios" ? { url } : { message: url });
  } else if (navigator.share) {
    await navigator.share({ title, url });
  } else {
    await navigator.clipboard.writeText(url);
    return true;
  }
  return false;
}

/** Shares the link to the page shown: native share sheet, Web Share API, or copy-to-clipboard on web browsers without it. */
export function ShareButton({ title, href, style }: { title: string; href: Href; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const share = async () => {
    const message = await shareFeedback(() => shareLink(title, webUrl(href, Platform.OS === "web" ? undefined : WEB_ORIGIN)));
    setStatus(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 3000);
    if (message && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  };
  return (
    <View style={style}>
      <Button variant="pill" onPress={share} accessibilityLabel={`Share ${title}`} tooltip="Copy a link to this page">
        Share
      </Button>
      <Text
        accessibilityLiveRegion="polite"
        style={{ position: "absolute", top: "100%", left: 0, width: 200, color: colors.textMuted, pointerEvents: "none" }}
      >
        {status}
      </Text>
    </View>
  );
}
