import { useFocusEffect } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BackupSection } from "../src/components/BackupSection";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import {
  generateLibraryId,
  getLibraries,
  removeLibrary as removeStoredLibrary,
  upsertLibrary,
  type Library,
} from "../src/storage/librarySettings";
import { stamp, type Unversioned } from "../src/storage/schema";
import { useTheme, useThemedStyles, useThemePreference, type Theme } from "../src/theme";
import type { ThemePreference } from "../src/storage/themePreference";

function LibraryCard({
  library,
  onSave,
  onRemove,
}: {
  library: Library;
  onSave: (library: Unversioned<Library>) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState(library.name);
  const [isbnUrl, setIsbnUrl] = useState(library.isbnUrl);
  const [titleUrl, setTitleUrl] = useState(library.titleUrl);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // The stored library changed under the card (a save, or an import): show the stored values,
  // so pressing Save can't write the card's stale ones over an import.
  const [shownUpdatedAt, setShownUpdatedAt] = useState(library.updatedAt);
  if (library.updatedAt !== shownUpdatedAt) {
    setShownUpdatedAt(library.updatedAt);
    setName(library.name);
    setIsbnUrl(library.isbnUrl);
    setTitleUrl(library.titleUrl);
  }

  const markDirty = () => {
    setSaved(false);
    setError("");
  };

  return (
    <View style={styles.libraryCard}>
      <View style={styles.libraryCardHeader}>
        <Text style={styles.fieldLabel}>Library Name</Text>
        <Pressable
          onPress={() => onRemove(library.id)}
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={library.name ? `Remove ${library.name}` : "Remove library"}
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        placeholder="e.g. Springfield Public Library"
        placeholderTextColor={theme.colors.inkFaint}
        value={name}
        onChangeText={(text) => {
          setName(text);
          markDirty();
        }}
      />

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Search by ISBN</Text>
      <Text style={styles.helpText}>
        1. Open your library's online catalog. 2. Search for any book's ISBN. 3. Copy the address of the results page
        and paste it here.{"\n"}
        <Text style={styles.advanced}>Advanced:</Text> use {"{isbn}"} where the ISBN goes if it isn't at the very end
        of the address.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="https://catalog.mylibrary.org/search?q="
        placeholderTextColor={theme.colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        value={isbnUrl}
        onChangeText={(text) => {
          setIsbnUrl(text);
          markDirty();
        }}
      />

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Search by Title</Text>
      <Text style={styles.helpText}>
        1. Open your library's online catalog. 2. Search for any book's title. 3. Copy the address of the results page
        and paste it here.{"\n"}
        <Text style={styles.advanced}>Advanced:</Text> use {"{title}"} where the title goes if it isn't at the very end
        of the address.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="https://catalog.mylibrary.org/search?q="
        placeholderTextColor={theme.colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        value={titleUrl}
        onChangeText={(text) => {
          setTitleUrl(text);
          markDirty();
        }}
      />

      <Button
        variant="primary"
        onPress={async () => {
          try {
            await onSave({ id: library.id, name: name.trim(), isbnUrl: isbnUrl.trim(), titleUrl: titleUrl.trim() });
            setSaved(true);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        style={styles.saveButton}
      >
        {saved ? "Saved" : "Save"}
      </Button>
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Standard" },
  { value: "dark", label: "Dark" },
];

function AppearanceSection() {
  const styles = useThemedStyles(createStyles);
  const { preference, setPreference } = useThemePreference();

  return (
    <View>
      <Text style={styles.sectionTitle} accessibilityRole="header">Appearance</Text>
      <View style={styles.themeOptions}>
        {THEME_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant="pill"
            active={preference === option.value}
            onPress={() => setPreference(option.value)}
            style={styles.themeOption}
          >
            {option.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

export default function Settings() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [libraries, setLibraries] = useState<Library[]>([]);

  const load = useCallback(() => {
    getLibraries().then(setLibraries);
  }, []);
  useFocusEffect(load);

  const handleAddLibrary = () => {
    setLibraries((prev) => [...prev, stamp({ id: generateLibraryId(), name: "", isbnUrl: "", titleUrl: "" })]);
  };

  const handleSaveLibrary = async (library: Unversioned<Library>) => {
    const next = await upsertLibrary(library);
    setLibraries(next);
  };

  const handleRemoveLibrary = async (id: string) => {
    const next = await removeStoredLibrary(id);
    setLibraries(next);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppearanceSection />

      <Text style={styles.sectionTitle} accessibilityRole="header">Libraries</Text>
      <Text style={styles.helpText}>Add your library so book pages can link to its catalog.</Text>

      {libraries.map((library) => (
        <LibraryCard key={library.id} library={library} onSave={handleSaveLibrary} onRemove={handleRemoveLibrary} />
      ))}

      <Pressable
        style={({ pressed }) => [styles.addLibraryRow, pressed && styles.pressed]}
        onPress={handleAddLibrary}
        accessibilityRole="button"
        accessibilityLabel="Add new library"
      >
        <View style={styles.addLibraryIcon}>
          <Plus size={16} color={theme.colors.cover} strokeWidth={2} />
        </View>
        <Text style={styles.addLibraryText}>Add new library</Text>
      </Pressable>

      <BackupSection onImported={load} />
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
    sectionTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: typeScale.md,
      color: colors.ink,
      marginTop: spacing.xxl,
      marginBottom: spacing.md,
    },
    removeButton: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      backgroundColor: colors.dangerBackground,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    removeText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.danger },
    errorText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.sm },
    pressed: { opacity: 0.6 },
    helpText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, lineHeight: 20, marginBottom: spacing.md },
    themeOptions: { flexDirection: "row", gap: spacing.sm },
    themeOption: { alignSelf: "auto" },
    fieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink, marginBottom: spacing.xs },
    fieldLabelSpaced: { marginTop: spacing.lg },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: 14,
      paddingVertical: spacing.md,
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      color: colors.ink,
    },
    saveButton: { marginTop: spacing.md },
    libraryCard: {
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radii.sm,
    },
    libraryCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    addLibraryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: spacing.lg,
      paddingVertical: 10,
    },
    addLibraryIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.cover,
      alignItems: "center",
      justifyContent: "center",
    },
    addLibraryText: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.cover },
    advanced: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.inkFaint },
  });
}
