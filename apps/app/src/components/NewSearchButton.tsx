import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

/** Header button on every screen but Home, so switching to a different book/author/subject doesn't require backing out through the whole navigation stack. Given a small pill background (rather than bare text) so it reads as a tappable control at a glance, not just another label sitting in the corner of the header. */
export function NewSearchButton() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={() => router.replace("/")}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.text}>New Search</Text>
    </Pressable>
  );
}

function createStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    button: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.chipBackground,
    },
    pressed: { opacity: 0.6 },
    text: { color: colors.link, fontSize: 14, fontWeight: "600" },
  });
}
