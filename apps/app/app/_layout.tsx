// Per-weight paths: the package root pulls in every weight, which bundles ~6 MB of unused fonts.
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../src/suppressKnownWebWarnings";
import { Button } from "../src/components/Button";
import { HeaderActions } from "../src/components/HeaderActions";
import { HeaderTitle } from "../src/components/HeaderTitle";
import { WebTooltip } from "../src/components/WebTooltip";
import { persistOptions } from "../src/queryCache";
import { useSavedPrefetch } from "../src/useSavedPrefetch";
import { loadSession, onSessionCleared } from "../src/hardcoverSession";
import { migrateStorage } from "../src/storage/snapshot";
import { CONTENT_MAX_WIDTH, ThemeProvider, useTheme } from "../src/theme";
import { darkColors, lightColors } from "../src/themeColors";

export default function RootLayout() {
  const [queryClient] = useState(
    // Unused queries must outlive a session in memory too, or the next persist would drop them from the offline cache.
    () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  );
  // gcTime is Infinity, so signed-out Hardcover data would otherwise linger (and persist) after disconnect or a 401.
  useEffect(() => onSessionCleared(() => queryClient.removeQueries({ queryKey: ["hardcover"] })), [queryClient]);
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Held back until stored data is upgraded, so no screen writes mid-migration; a failure must not blank the app,
  // so the app renders with a retry notice instead.
  const [migrated, setMigrated] = useState(false);
  const [migrationFailed, setMigrationFailed] = useState(false);
  // The system scheme, not the saved preference: preferences aren't read until migration finishes.
  const scheme = useColorScheme();
  const migrate = useCallback(() => {
    Promise.all([migrateStorage(), loadSession().catch(() => {})])
      .then(() => setMigrationFailed(false), () => setMigrationFailed(true))
      .finally(() => setMigrated(true));
  }, []);
  useEffect(migrate, [migrate]);

  // A failed font load falls back to system fonts rather than blanking the app.
  // Paper-filled rather than blank, so dark mode doesn't flash white; no text, as the fonts aren't loaded yet.
  if ((!fontsLoaded && !fontError) || !migrated) {
    return <View style={[styles.root, { backgroundColor: (scheme === "dark" ? darkColors : lightColors).paper }]} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <ThemedShell migrationFailed={migrationFailed} onRetryMigration={migrate} />
        </PersistQueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Everything the app renders lives inside this width-capped, centered
// column — on a phone it's a no-op (the screen is already narrower than
// CONTENT_MAX_WIDTH), but on a maximized desktop browser or a large tablet
// it keeps the whole app, header included, from stretching edge to edge and
// leaving controls like "New Search" stranded off in a far corner of the
// window.
// Insets header buttons from the screen edge so every screen's pills sit the same distance in.
const inHeader = (buttons: ReactNode) => () => <View style={styles.headerRight}>{buttons}</View>;

function ThemedShell({ migrationFailed, onRetryMigration }: { migrationFailed: boolean; onRetryMigration: () => void }) {
  const theme = useTheme();
  useSavedPrefetch(); // rendered only after migrateStorage has finished

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.shellBackground }]}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <View style={[styles.content, { backgroundColor: theme.colors.paper }]}>
        {migrationFailed && (
          <View style={styles.notice}>
            <Text
              style={{ color: theme.colors.danger, fontFamily: theme.fonts.body }}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              Your saved data couldn't be upgraded, so some of it may not appear.
            </Text>
            <Button variant="pill" onPress={onRetryMigration} accessibilityLabel="Retry upgrading saved data">
              Retry
            </Button>
          </View>
        )}
        <View style={styles.stackArea}>
          <Stack
            screenOptions={{
              headerTitle: ({ children }) => <HeaderTitle>{children}</HeaderTitle>,
              headerTitleStyle: { fontFamily: theme.fonts.displayMedium, color: theme.colors.ink },
              headerStyle: { backgroundColor: theme.colors.paper },
              headerShadowVisible: false,
              headerTintColor: theme.colors.cover,
              contentStyle: { backgroundColor: theme.colors.paper },
            }}
          >
            <Stack.Screen name="index" options={{ title: "Shelf Thread", headerRight: inHeader(<HeaderActions show={["about", "library"]} />) }} />
            <Stack.Screen
              name="scan"
              options={{ title: "Scan Barcode", presentation: "modal", headerRight: inHeader(<HeaderActions />) }}
            />
            <Stack.Screen name="book/[isbn]" options={{ title: "Book", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="author/[id]" options={{ title: "Author", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen
              name="subject/[slug]"
              options={{ title: "Subject", headerRight: inHeader(<HeaderActions />) }}
            />
            <Stack.Screen name="work/[id]" options={{ title: "Work", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="search" options={{ title: "Search", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen
              name="graph/[type]/[id]"
              options={{ title: "Explore Graph", headerRight: inHeader(<HeaderActions />) }}
            />
            <Stack.Screen name="connection" options={{ title: "Find Connection", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="saved" options={{ title: "My Library", headerRight: inHeader(<HeaderActions show={["about", "search"]} />) }} />
            <Stack.Screen name="recommendations" options={{ title: "Recommendations", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="backup" options={{ title: "Import & Export", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="settings" options={{ title: "Settings", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="hardcover" options={{ title: "My Hardcover Account", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="hardcover-connected" options={{ title: "Hardcover", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="about" options={{ title: "About", headerRight: inHeader(<HeaderActions show={["library", "search"]} />) }} />
            <Stack.Screen name="lists/index" options={{ title: "Lists", headerRight: inHeader(<HeaderActions />) }} />
            <Stack.Screen name="lists/[id]" options={{ title: "List", headerRight: inHeader(<HeaderActions />) }} />
          </Stack>
        </View>
        <WebTooltip />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: { flex: 1, alignItems: "center" },
  content: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
  stackArea: { flex: 1 },
  notice: { padding: 12, gap: 8, alignItems: "center" },
  headerRight: { paddingRight: 16 },
});
