import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { routes } from "../navigation";
import {
  buildLibraryIsbnSearchUrl,
  buildLibraryTitleSearchUrl,
  getConfiguredLibraries,
  type Library,
} from "../storage/librarySettings";
import { useThemedStyles, type Theme } from "../theme";

/**
 * With a single configured library, its ISBN/title links are shown as two
 * flat rows, matching how this looked before multiple libraries existed.
 * With more than one, each library collapses behind its own "Find at
 * {name}" row instead — showing every library's ISBN and title rows flat
 * would be a wall of near-identical rows once someone has, say, a public
 * library and a school library both configured.
 */
export function LibraryFindLinks({ isbn, title }: { isbn?: string | null; title: string }) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getConfiguredLibraries().then(setLibraries);
  }, []);

  if (libraries.length === 0) {
    return (
      <Pressable
        style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
        onPress={() => router.push(routes.saved())}
      >
        <Text style={styles.findRowHint}>Add your library's search URL in My Library to see it here.</Text>
      </Pressable>
    );
  }

  const linkRow = (key: string, label: string, url: string) => (
    <Pressable
      key={key}
      style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
      onPress={() => Linking.openURL(url)}
    >
      <Text style={styles.findRowText}>{label}</Text>
      <Text style={styles.findRowChevron}>›</Text>
    </Pressable>
  );

  if (libraries.length === 1) {
    const library = libraries[0];
    return (
      <>
        {isbn && library.isbnUrl && linkRow("isbn", `Find at ${library.name} (ISBN)`, buildLibraryIsbnSearchUrl(library.isbnUrl, isbn))}
        {library.titleUrl && linkRow("title", `Find at ${library.name} (title)`, buildLibraryTitleSearchUrl(library.titleUrl, title))}
      </>
    );
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      {libraries.map((library) => {
        const expanded = expandedIds.has(library.id);
        return (
          <View key={library.id}>
            <Pressable
              style={({ pressed }) => [styles.findRow, pressed && styles.pressed]}
              onPress={() => toggleExpanded(library.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <Text style={styles.findRowText}>Find at {library.name}</Text>
              <Text style={styles.findRowChevron}>{expanded ? "⌄" : "›"}</Text>
            </Pressable>
            {expanded && (
              <View style={styles.subRows}>
                {isbn &&
                  library.isbnUrl &&
                  linkRow(`${library.id}-isbn`, "By ISBN", buildLibraryIsbnSearchUrl(library.isbnUrl, isbn))}
                {library.titleUrl &&
                  linkRow(`${library.id}-title`, "By title", buildLibraryTitleSearchUrl(library.titleUrl, title))}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    findRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    subRows: { paddingLeft: 16 },
    findRowText: { fontSize: 16, color: colors.link },
    findRowChevron: { fontSize: 18, color: colors.textFaint, fontWeight: "600" },
    findRowHint: { fontSize: 13, color: colors.textFaint, fontStyle: "italic" },
    pressed: { opacity: 0.6 },
  });
}
