import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";

/** Large "Shelf Thread" on every screen (the link home off the home page) above the page title, or the tagline on home. */
export function HeaderTitle({ children }: { children: string }) {
  const router = useRouter();
  const { colors, fonts, typeScale } = useTheme();
  if (children === "Shelf Thread") {
    return (
      <View>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, color: colors.ink, fontSize: typeScale.lg }}>
          Shelf Thread
        </Text>
        <Text style={{ fontFamily: fonts.body, color: colors.inkFaint, fontSize: typeScale.xs }}>find your next read</Text>
      </View>
    );
  }
  return (
    <View>
      <Pressable
        ref={titleRef("Go to the home page")}
        onPress={() => router.replace("/")}
        accessibilityRole="link"
        accessibilityLabel="Shelf Thread"
      >
        <Text style={{ fontFamily: fonts.display, color: colors.cover, fontSize: typeScale.lg }}>Shelf Thread</Text>
      </Pressable>
      <Text numberOfLines={1} style={{ fontFamily: fonts.displayMedium, color: colors.ink, fontSize: typeScale.sm }}>
        {children}
      </Text>
    </View>
  );
}
