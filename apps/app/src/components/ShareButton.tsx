import type { Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Share, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { WEB_ORIGIN, shareFeedback, webUrl } from "../share";
import { useTheme } from "../theme";
import { Button } from "./Button";

/** Web always copies the link (the browser share sheet offers Notes and Freeform); native opens its share sheet. Resolves true when it copied. */
async function shareLink(url: string): Promise<boolean> {
  if (Platform.OS !== "web") {
    // iOS shows `message` and `url` both, so send only one per platform.
    await Share.share(Platform.OS === "ios" ? { url } : { message: url });
  } else {
    await navigator.clipboard.writeText(url);
    return true;
  }
  return false;
}

/** Shares the link to the page shown: native share sheet, or copy-to-clipboard on web. */
export function ShareButton({ title, href, style, align = "left" }: { title: string; href: Href; style?: StyleProp<ViewStyle>; align?: "left" | "right" }) {
  const { colors } = useTheme();
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const share = async () => {
    const message = await shareFeedback(() => shareLink(webUrl(href, Platform.OS === "web" ? undefined : WEB_ORIGIN)));
    setStatus(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 3000);
    if (message && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  };
  return (
    <View>
      <Button variant="pill" style={style} onPress={share} accessibilityLabel={`Share ${title}`} tooltip="Copy link">
        Share
      </Button>
      <Text
        accessibilityLiveRegion="polite"
        style={{ position: "absolute", top: "100%", [align]: 0, width: 200, textAlign: align, color: colors.textMuted, pointerEvents: "none" }}
      >
        {status}
      </Text>
    </View>
  );
}
