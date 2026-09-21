import type { WorkRef } from "@book-explorer/shared";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

/** A tappable cover/title/author row for a work — shared by any screen that
 * lists works from Open Library (a subject's book list, search results). */
export function WorkListRow({ work, onPress }: { work: WorkRef; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>
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
          {work.authors.map((a) => a.name).join(", ") || "Unknown author"}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pressed: { opacity: 0.6 },
    cover: { width: 44, height: 64, borderRadius: 4 },
    coverPlaceholder: { width: 44, height: 64, borderRadius: 4, backgroundColor: colors.chipBackground },
    info: { flex: 1, justifyContent: "center" },
    title: { fontSize: 16, fontWeight: "600", color: colors.text },
    authors: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
    chevron: { fontSize: 18, color: colors.textFaint, fontWeight: "600" },
  });
}
