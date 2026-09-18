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
import { getRecentIsbns } from "../src/storage/history";

export default function Home() {
  const router = useRouter();
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
    router.push(`/book/${trimmed}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Book Explorer</Text>
      <Text style={styles.subtitle}>Scan a barcode or enter an ISBN to start exploring.</Text>

      <Pressable style={styles.scanButton} onPress={() => router.push("/scan")}>
        <Text style={styles.scanButtonText}>Scan Barcode</Text>
      </Pressable>

      <View style={styles.manualEntry}>
        <TextInput
          style={styles.input}
          placeholder="Enter ISBN"
          value={isbn}
          onChangeText={setIsbn}
          keyboardType="number-pad"
          onSubmitEditing={() => goToBook(isbn)}
        />
        <Pressable style={styles.lookupButton} onPress={() => goToBook(isbn)}>
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
              <Pressable style={styles.recentItem} onPress={() => goToBook(item)}>
                <Text style={styles.recentItemText}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "700", marginTop: 12 },
  subtitle: { fontSize: 15, color: "#666", marginTop: 6, marginBottom: 24 },
  scanButton: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  scanButtonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  manualEntry: { flexDirection: "row", gap: 10, marginTop: 20 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  lookupButton: {
    backgroundColor: "#eee",
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  lookupButtonText: { fontWeight: "600" },
  recentSection: { marginTop: 32, flex: 1 },
  recentTitle: { fontSize: 15, fontWeight: "600", color: "#888", marginBottom: 8 },
  recentItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  recentItemText: { fontSize: 16 },
});
