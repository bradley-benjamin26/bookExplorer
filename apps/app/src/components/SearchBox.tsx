import { isValidIsbn } from "@book-explorer/shared";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { routes } from "../navigation";
import { titleRef } from "../webTitle";
import { useTheme, useThemedStyles, type Theme } from "../theme";

/** The title/author/ISBN search field: an ISBN opens that book, anything else the search results. */
export function SearchBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState("");

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(isValidIsbn(trimmed) ? routes.book(trimmed) : routes.search(trimmed));
  };

  return (
    <View style={[styles.row, style]}>
      <TextInput
        style={styles.input}
        placeholder="Search by title, author, or ISBN"
        placeholderTextColor={theme.colors.inkFaint}
        accessibilityLabel="Search by title, author, or ISBN"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={submit}
      />
      <Pressable
        ref={titleRef("Search")}
        onPress={submit}
        accessibilityRole="button"
        accessibilityLabel="Search"
        hitSlop={8}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Search size={20} color={theme.colors.cover} />
      </Pressable>
    </View>
  );
}

function createStyles({ colors, fonts, typeScale, spacing, radii }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.button,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
    },
    input: { flex: 1, fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, paddingVertical: spacing.md },
    pressed: { opacity: 0.6 },
  });
}
