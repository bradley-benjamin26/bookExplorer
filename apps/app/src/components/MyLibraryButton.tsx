import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { routes } from "../navigation";
import { useThemedStyles, type Theme } from "../theme";

/** Header button on every screen but My Library itself, so the saved list is always one tap away. */
export function MyLibraryButton() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={() => router.push(routes.saved())}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.text}>My Library</Text>
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
