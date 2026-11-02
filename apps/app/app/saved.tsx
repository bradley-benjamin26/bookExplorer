import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Footer } from "../src/components/Footer";
import { HardcoverLogo } from "../src/components/HardcoverLogo";
import { LIBRARY_ROWS } from "../src/libraryRows";
import { routes } from "../src/navigation";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";
import { rowFeedback } from "../src/rowFeedback";
import { titleRef } from "../src/webTitle";

const ROUTES = {
  hardcover: routes.hardcover,
  lists: routes.lists,
  recommendations: routes.recommendations,
  connection: routes.connection,
  backup: routes.backup,
  settings: routes.settings,
};

export default function Saved() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {LIBRARY_ROWS.map(({ id, label }) => (
        <Pressable
          ref={titleRef(`Open ${label}`)}
          key={id}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.navRow, rowFeedback(theme.colors, { pressed, hovered })]}
          onPress={() => router.push(ROUTES[id]())}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {id === "hardcover" ? (
            <View style={styles.navRowText}>
              <HardcoverLogo height={22} />
            </View>
          ) : (
            <Text style={styles.navRowText}>{label}</Text>
          )}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronRight size={18} color={theme.colors.inkFaint} />
          </View>
        </Pressable>
      ))}

      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, radii, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 44,
      paddingVertical: spacing.md,
      marginHorizontal: -spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    navRowText: { flex: 1, fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
  });
}
