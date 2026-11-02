import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { headerSubtitle } from "../headerSubtitle";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";

/** The "Shelf Thread" wordmark, one size on every screen: the tagline sits under it on home,
 * the link home elsewhere, with the page name underneath only on utility pages. */
export function HeaderTitle({ children }: { children: string }) {
  const router = useRouter();
  const { colors, fonts, typeScale } = useTheme();
  const wordmark = { fontFamily: fonts.displayMedium, color: colors.ink, fontSize: typeScale.md };
  if (children === "Shelf Thread") {
    return (
      <View>
        <Text accessibilityRole="header" style={wordmark}>
          Shelf Thread
        </Text>
        <Text style={{ fontFamily: fonts.body, color: colors.inkFaint, fontSize: typeScale.xs }}>find your next read</Text>
      </View>
    );
  }
  const subtitle = headerSubtitle(children);
  return (
    <View>
      <Pressable
        ref={titleRef("Go to the home page")}
        onPress={() => router.replace("/")}
        accessibilityRole="link"
        accessibilityLabel="Shelf Thread"
      >
        <Text style={wordmark}>Shelf Thread</Text>
      </Pressable>
      {subtitle && (
        <Text numberOfLines={1} style={{ fontFamily: fonts.body, color: colors.inkFaint, fontSize: typeScale.xs }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
