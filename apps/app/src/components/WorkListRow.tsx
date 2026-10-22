import type { WorkRef } from "@book-explorer/shared";
import { ChevronRight } from "lucide-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";

/** A tappable cover/title/author row for a work — shared by any screen that
 * lists works from Open Library (a subject's book list, search results). */
export function WorkListRow({ work, onPress }: { work: WorkRef; onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const authorNames = work.authors.map((a) => a.name).join(", ") || "Unknown author";
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${work.title}, ${authorNames}`}
    >
      {work.coverUrl ? (
        <Image source={{ uri: work.coverUrl }} style={styles.cover} resizeMode="contain" />
      ) : (
        <View style={styles.coverPlaceholder} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {work.title}
        </Text>
        <Text style={styles.authors} numberOfLines={1}>
          {authorNames}
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.inkFaint} strokeWidth={2} />
    </Pressable>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pressed: { opacity: 0.6 },
    cover: { width: 44, height: 64, borderRadius: 4 },
    coverPlaceholder: { width: 44, height: 64, borderRadius: 4, backgroundColor: colors.chipBackground },
    info: { flex: 1, justifyContent: "center" },
    title: { fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    authors: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: 2 },
  });
}
