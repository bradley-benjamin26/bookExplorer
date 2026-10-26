import type { WorkRef } from "@book-explorer/shared";
import { ChevronRight } from "lucide-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { seriesRowLabel } from "../seriesLabel";
import { CoverPlaceholder } from "./CoverPlaceholder";
import { useTheme, useThemedStyles, type Theme } from "../theme";

/** A tappable cover/title/author row for a work — shared by any screen that
 * lists works from Open Library (a subject's book list, search results). */
export function WorkListRow({
  work,
  onPress,
  series,
  note,
}: {
  work: WorkRef;
  onPress?: () => void;
  /** Set for a row in a series list: shows the position instead of authors and flags the current book. */
  series?: { position: string | null; current: boolean };
  /** An extra line under the authors, also read out as part of the row's label. */
  note?: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const authorNames = work.authors.map((a) => a.name).join(", ") || "Unknown author";
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[seriesRowLabel(work.title, series) ?? `${work.title}, ${authorNames}`, note].filter(Boolean).join(". ")}
      accessibilityState={{ disabled: !onPress, selected: series?.current }}
      disabled={!onPress}
    >
      {work.coverUrl ? (
        <Image source={{ uri: work.coverUrl }} style={styles.cover} resizeMode="contain" />
      ) : (
        <CoverPlaceholder width={44} height={64} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {work.title}
        </Text>
        <Text style={styles.authors} numberOfLines={1}>
          {series ? [series.position && `Book ${series.position}`, series.current && "You are here"].filter(Boolean).join(" · ") : authorNames}
        </Text>
        {note ? (
          <Text style={styles.authors} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><ChevronRight size={18} color={theme.colors.inkFaint} strokeWidth={2} /></View>
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
    info: { flex: 1, justifyContent: "center" },
    title: { fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    authors: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: 2 },
  });
}
