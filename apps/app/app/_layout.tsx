import { Fraunces_500Medium, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../src/suppressKnownWebWarnings";
import { Footer } from "../src/components/Footer";
import { HeaderActions } from "../src/components/HeaderActions";
import { MyLibraryButton } from "../src/components/MyLibraryButton";
import { NewSearchButton } from "../src/components/NewSearchButton";
import { migrateStorage } from "../src/storage/snapshot";
import { CONTENT_MAX_WIDTH, ThemeProvider, useTheme } from "../src/theme";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Held back until stored data is upgraded, so no screen writes mid-migration; a failure must not blank the app.
  const [migrated, setMigrated] = useState(false);
  useEffect(() => {
    migrateStorage().catch(() => undefined).finally(() => setMigrated(true));
  }, []);

  // A failed font load falls back to system fonts rather than blanking the app.
  if ((!fontsLoaded && !fontError) || !migrated) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ThemedShell />
        </QueryClientProvider>
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

function ThemedShell() {
  const theme = useTheme();

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.shellBackground }]}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <View style={[styles.content, { backgroundColor: theme.colors.paper }]}>
        <View style={styles.stackArea}>
          <Stack
            screenOptions={{
              headerTitleStyle: { fontFamily: theme.fonts.displayMedium, color: theme.colors.ink },
              headerStyle: { backgroundColor: theme.colors.paper },
              headerShadowVisible: false,
              headerTintColor: theme.colors.cover,
              contentStyle: { backgroundColor: theme.colors.paper },
            }}
          >
            <Stack.Screen name="index" options={{ title: "Book Explorer", headerRight: inHeader(<MyLibraryButton />) }} />
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
            <Stack.Screen name="saved" options={{ title: "My Library", headerRight: inHeader(<NewSearchButton />) }} />
          </Stack>
        </View>
        <Footer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: { flex: 1, alignItems: "center" },
  content: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
  stackArea: { flex: 1 },
  headerRight: { paddingRight: 16 },
});
