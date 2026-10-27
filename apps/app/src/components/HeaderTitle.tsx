import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { titleRef } from "../webTitle";
import { useTheme } from "../theme";

/** Header title with a small "Shelf Thread" home link above the page title, so every screen has a way home. */
export function HeaderTitle({ children }: { children: string }) {
  const router = useRouter();
  const { colors, fonts, typeScale } = useTheme();
  return (
    <View>
      <Pressable
        ref={titleRef("Go to the home page")}
        onPress={() => router.replace("/")}
        accessibilityRole="link"
        accessibilityLabel="Shelf Thread"
      >
        <Text style={{ fontFamily: fonts.display, color: colors.cover, fontSize: typeScale.xs }}>Shelf Thread</Text>
      </Pressable>
      <Text numberOfLines={1} style={{ fontFamily: fonts.displayMedium, color: colors.ink, fontSize: typeScale.sm }}>
        {children}
      </Text>
    </View>
  );
}
