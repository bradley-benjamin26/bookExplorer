import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Footer } from "../src/components/Footer";
import { RecommendationsSection } from "../src/components/RecommendationsSection";
import { getSavedItems, type SavedItem } from "../src/storage/savedItems";
import { useThemedStyles, type Theme } from "../src/theme";

export default function Recommendations() {
  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<SavedItem[]>([]);

  const load = useCallback(() => {
    getSavedItems().then(setItems);
  }, []);
  useFocusEffect(load);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <RecommendationsSection refreshKey={items} />
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
  });
}
