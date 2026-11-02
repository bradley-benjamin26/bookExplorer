import { useFocusEffect, useRouter } from "expo-router";
import { ArrowDownUp, ChevronRight, Settings, Sparkles, Waypoints } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../src/components/Button";
import { CoverStack } from "../src/components/CoverStack";
import { Footer } from "../src/components/Footer";
import { HardcoverLogo } from "../src/components/HardcoverLogo";
import { PressableRow } from "../src/components/PressableRow";
import { LIBRARY_PRIMARY, LIBRARY_TOOLS } from "../src/libraryRows";
import { listCoverUrls } from "../src/listCovers";
import { routes } from "../src/navigation";
import { getLists, type SavedList } from "../src/storage/savedLists";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

const ROUTES = {
  hardcover: routes.hardcover,
  recommendations: routes.recommendations,
  connection: routes.connection,
  backup: routes.backup,
  settings: routes.settings,
};

const ICONS = { recommendations: Sparkles, connection: Waypoints, backup: ArrowDownUp, settings: Settings };

type RowDef = (typeof LIBRARY_PRIMARY)[number] | (typeof LIBRARY_TOOLS)[number];

export default function Saved() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    getLists()
      .then(setLists)
      .catch(() => setError("Couldn't load your lists. Try again."));
  }, []);
  useFocusEffect(load);

  const chevron = (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ChevronRight size={18} color={colors.inkFaint} />
    </View>
  );
  const navRow = ({ id, label }: RowDef) => {
    const Icon = id === "hardcover" ? null : ICONS[id];
    return (
      <PressableRow key={id} label={label} tooltip={`Open ${label}`} onPress={() => router.push(ROUTES[id]())} trailing={chevron}>
        <View style={styles.navRow}>
          {Icon ? <Icon size={20} color={colors.cover} /> : <HardcoverLogo height={22} />}
          <Text style={styles.rowText}>{id === "hardcover" ? "Account" : label}</Text>
        </View>
      </PressableRow>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {navRow(LIBRARY_PRIMARY[0])}

      <Text style={styles.heading} accessibilityRole="header">
        Your lists
      </Text>
      {error ? (
        <>
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
          <Button variant="pill" onPress={load} style={styles.retry}>
            Retry
          </Button>
        </>
      ) : lists.length === 0 ? (
        <Text style={styles.empty}>Save a book from its page to start a list.</Text>
      ) : (
        lists.map((list) => {
          const noun = list.kind === "author" ? "author" : "book";
          const count = `${list.members.length} ${noun}${list.members.length === 1 ? "" : "s"}`;
          return (
            <PressableRow
              key={list.id}
              label={`${list.name}, ${count}`}
              tooltip={`Open ${list.name}`}
              onPress={() => router.push(routes.list(list.id))}
              trailing={chevron}
            >
              <View style={styles.listRow}>
                <CoverStack urls={listCoverUrls(list.members)} />
                <View style={styles.listText}>
                  <Text style={styles.rowText} numberOfLines={2}>
                    {list.name}
                  </Text>
                  <Text style={styles.count}>{count}</Text>
                </View>
              </View>
            </PressableRow>
          );
        })
      )}
      <PressableRow label="See all lists" onPress={() => router.push(routes.lists())} trailing={chevron}>
        <Text style={styles.rowText}>See all lists</Text>
      </PressableRow>

      <View style={styles.group}>{LIBRARY_PRIMARY.slice(1).map(navRow)}</View>

      <Text style={styles.tools} accessibilityRole="header">
        Tools
      </Text>
      {LIBRARY_TOOLS.map(navRow)}

      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
    // Quiet: tools are not the point of this page.
    tools: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.xl, marginBottom: spacing.xs },
    group: { marginTop: spacing.md },
    // Medium, not semibold: 600 Fraunces reads heavy at 16px row size.
    rowText: { fontFamily: fonts.displayMedium, fontSize: typeScale.sm, color: colors.ink },
    navRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    listText: { flex: 1 },
    count: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: 2 },
    empty: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, fontStyle: "italic", marginBottom: spacing.sm },
    error: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger },
    retry: { marginTop: spacing.sm, alignSelf: "flex-start" },
  });
}
