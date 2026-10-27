import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CreateListForm } from "../../src/components/AddToListButton";
import { Button } from "../../src/components/Button";
import { Footer } from "../../src/components/Footer";
import { routes } from "../../src/navigation";
import { getLists, type SavedList } from "../../src/storage/savedLists";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

const SECTIONS = [
  { kind: "book", title: "Book lists", noun: "book", empty: "No book lists yet. Tap “Save to list” on a book page to start one." },
  { kind: "author", title: "Author lists", noun: "author", empty: "No author lists yet. Tap “Save to list” on an author page to start one." },
] as const;

export default function Lists() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    getLists()
      .then(setLists)
      .catch(() => setError("Couldn't load your lists. Try again."));
  }, []);
  useFocusEffect(load);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button variant="pill" active={creating} onPress={() => setCreating((c) => !c)}>
        New list
      </Button>
      {creating && (
        <CreateListForm
          submitLabel="Create"
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {error ? (
        <>
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
          <Button variant="pill" onPress={load} style={styles.retry}>
            Retry
          </Button>
        </>
      ) : null}

      {SECTIONS.map((section) => {
        const ofKind = lists.filter((l) => l.kind === section.kind);
        return (
          <View key={section.kind}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {section.title}
            </Text>
            {ofKind.length === 0 ? (
              <Text style={styles.emptyText}>{section.empty}</Text>
            ) : (
              ofKind.map((list) => {
                const count = `${list.members.length} ${section.noun}${list.members.length === 1 ? "" : "s"}`;
                return (
                  <Pressable
                    key={list.id}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    onPress={() => router.push(routes.list(list.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`${list.name}, ${count}`}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.rowText} numberOfLines={2}>
                        {list.name}
                      </Text>
                      <Text style={styles.countText}>{count}</Text>
                    </View>
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <ChevronRight size={18} color={theme.colors.inkFaint} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        );
      })}

      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    error: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.md },
    retry: { marginTop: spacing.sm, alignSelf: "flex-start" },
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
    sectionTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: typeScale.md,
      color: colors.ink,
      marginTop: spacing.xxl,
      marginBottom: spacing.md,
    },
    emptyText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, fontStyle: "italic" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowMain: { flex: 1 },
    rowText: { fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink },
    countText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: 2 },
    pressed: { opacity: 0.6 },
  });
}
