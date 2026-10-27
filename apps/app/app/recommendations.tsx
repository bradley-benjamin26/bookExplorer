import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { RecommendationsSection } from "../src/components/RecommendationsSection";
import { getLists, type SavedList } from "../src/storage/savedLists";
import { getSavedItems, type SavedItem } from "../src/storage/savedItems";
import { useThemedStyles, type Theme } from "../src/theme";

export default function Recommendations() {
  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<SavedItem[]>([]);

  const [lists, setLists] = useState<SavedList[]>([]);
  const [listId, setListId] = useState<string | null>(null);

  const load = useCallback(() => {
    getSavedItems().then(setItems);
    getLists().then((all) => {
      setLists(all);
      setListId((id) => (all.some((l) => l.id === id) ? id : null)); // a list deleted elsewhere falls back to all
    });
  }, []);
  useFocusEffect(load);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {lists.length > 0 && (
        <View style={styles.pills}>
          <Button variant="pill" active={listId === null} onPress={() => setListId(null)} style={styles.pill}>
            All lists
          </Button>
          {lists.map((l) => (
            <Button key={l.id} variant="pill" active={listId === l.id} onPress={() => setListId(l.id)} style={styles.pill}>
              {l.name}
            </Button>
          ))}
        </View>
      )}
      <RecommendationsSection refreshKey={items} listId={listId} />
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    pill: { alignSelf: "auto" },
  });
}
