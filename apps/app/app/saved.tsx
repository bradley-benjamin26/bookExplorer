import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Footer } from "../src/components/Footer";
import { routes } from "../src/navigation";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

export default function Saved() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {([["Lists", routes.lists()], ["Recommendations", routes.recommendations()], ["Find Connection", routes.connection()], ["Settings", routes.settings()]] as const).map(([label, href]) => (
        <Pressable
          key={label}
          style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
          onPress={() => router.push(href)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text style={styles.navRowText}>{label}</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronRight size={18} color={theme.colors.inkFaint} />
          </View>
        </Pressable>
      ))}

      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
    pressed: { opacity: 0.6 },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    navRowText: { flex: 1, fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
  });
}
