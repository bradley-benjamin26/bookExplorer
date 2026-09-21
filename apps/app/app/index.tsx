import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button } from "../src/components/Button";
import { routes } from "../src/navigation";
import { getRecentIsbns } from "../src/storage/history";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

export default function Home() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [isbn, setIsbn] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      getRecentIsbns().then(setRecent);
    }, [])
  );

  const goToBook = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(routes.book(trimmed));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Book Explorer</Text>
          <Text style={styles.subtitle}>Scan a barcode, search by title or author, or enter an ISBN to start exploring.</Text>
        </View>
        <Pressable
          style={({ pressed }) => pressed && styles.pressed}
          onPress={() => router.push(routes.saved())}
          hitSlop={8}
        >
          <Text style={styles.libraryLink}>My Library</Text>
        </Pressable>
      </View>

      <Button variant="primary" onPress={() => router.push("/scan")} style={styles.scanButton}>
        Scan Barcode
      </Button>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Button variant="primary" onPress={() => router.push(routes.search())} style={styles.searchButton}>
        Search by Title or Author
      </Button>

      <Text style={styles.orIsbnText}>or enter an exact ISBN</Text>

      <View style={styles.manualEntry}>
        <TextInput
          style={styles.input}
          placeholder="Enter ISBN"
          placeholderTextColor={theme.colors.textFaint}
          value={isbn}
          onChangeText={setIsbn}
          keyboardType="number-pad"
          onSubmitEditing={() => goToBook(isbn)}
        />
        <Pressable
          style={({ pressed }) => [styles.lookupButton, pressed && styles.pressed]}
          onPress={() => goToBook(isbn)}
        >
          <Text style={styles.lookupButtonText}>Look up</Text>
        </Pressable>
      </View>

      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent</Text>
          <FlatList
            data={recent}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.recentItem, pressed && styles.pressed]}
                onPress={() => goToBook(item)}
              >
                <Text style={styles.recentItemText}>{item}</Text>
                <Text style={styles.recentItemChevron}>›</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles({ colors, kicker }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 12 },
    title: { fontSize: 30, fontWeight: "700", letterSpacing: -0.4, color: colors.text },
    subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 24, maxWidth: 260, lineHeight: 20 },
    libraryLink: { fontSize: 15, color: colors.link, fontWeight: "600", marginTop: 6 },
    pressed: { opacity: 0.6 },
    scanButton: { paddingVertical: 16 },
    divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: {
      fontSize: 12,
      color: colors.textFaint,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    searchButton: { marginTop: 20 },
    orIsbnText: {
      fontSize: 13,
      color: colors.textFaint,
      textAlign: "center",
      marginTop: 18,
    },
    manualEntry: { flexDirection: "row", gap: 10, marginTop: 10 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    lookupButton: {
      backgroundColor: colors.chipBackground,
      borderRadius: 10,
      paddingHorizontal: 18,
      justifyContent: "center",
    },
    lookupButtonText: { fontWeight: "600", color: colors.text },
    recentSection: { marginTop: 32, flex: 1 },
    recentTitle: { ...kicker, marginBottom: 10 },
    recentItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    recentItemText: { fontSize: 16, letterSpacing: 0.3, color: colors.text },
    recentItemChevron: { fontSize: 18, color: colors.textFaint, fontWeight: "600" },
  });
}
