import { useRouter } from "expo-router";
import { BookOpen } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { ThreadMark } from "./ThreadMark";
import { headerSubtitle } from "../headerSubtitle";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";

/** The "Shelf Thread" wordmark, one size on every screen: the brand mark and tagline sit with it on home,
 * the link home elsewhere, with the page name underneath only on utility pages. */
export function HeaderTitle({ children }: { children: string }) {
  const router = useRouter();
  const { colors, fonts, typeScale } = useTheme();
  const [markWidth, setMarkWidth] = useState(0);
  // shortcut: web only, the native stack's fixed header height has no room for it; add a native layout if wanted.
  const mark = Platform.OS === "web" ? <ThreadMark width={markWidth} /> : null;
  const wordmark = { fontFamily: fonts.displayMedium, color: colors.ink, fontSize: typeScale.md };
  if (children === "Shelf Thread") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {/* Decorative brand mark; the wordmark names the app. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <BookOpen size={28} color={colors.cover} strokeWidth={1.7} />
        </View>
        <View>
          <View style={{ alignSelf: "flex-start" }} onLayout={(e) => setMarkWidth(Math.round(e.nativeEvent.layout.width))}>
            <Text accessibilityRole="header" style={wordmark}>
              Shelf Thread
            </Text>
          </View>
          {mark}
          <Text style={{ fontFamily: fonts.body, color: colors.inkFaint, fontSize: typeScale.xs }}>A little further into books</Text>
        </View>
      </View>
    );
  }
  const subtitle = headerSubtitle(children);
  return (
    <View>
      <View style={{ alignSelf: "flex-start" }} onLayout={(e) => setMarkWidth(Math.round(e.nativeEvent.layout.width))}>
        <Pressable
          ref={titleRef("Go to the home page")}
          onPress={() => router.replace("/")}
          accessibilityRole="link"
          accessibilityLabel="Shelf Thread"
        >
          <Text style={wordmark}>Shelf Thread</Text>
        </Pressable>
      </View>
      {mark}
      {subtitle && (
        <Text numberOfLines={1} style={{ fontFamily: fonts.body, color: colors.inkFaint, fontSize: typeScale.xs }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
