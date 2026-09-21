import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import "../src/suppressKnownWebWarnings";
import { Footer } from "../src/components/Footer";
import { HeaderActions } from "../src/components/HeaderActions";
import { NewSearchButton } from "../src/components/NewSearchButton";
import { CONTENT_MAX_WIDTH, ThemeProvider, useTheme } from "../src/theme";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ThemedShell />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

// Everything the app renders lives inside this width-capped, centered
// column — on a phone it's a no-op (the screen is already narrower than
// CONTENT_MAX_WIDTH), but on a maximized desktop browser or a large tablet
// it keeps the whole app, header included, from stretching edge to edge and
// leaving controls like "New Search" stranded off in a far corner of the
// window.
function ThemedShell() {
  const theme = useTheme();

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.shellBackground }]}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
        <View style={styles.stackArea}>
          <Stack
            screenOptions={{
              headerTitleStyle: { fontWeight: "600", color: theme.colors.text },
              headerStyle: { backgroundColor: theme.colors.background },
              headerShadowVisible: false,
              headerTintColor: theme.colors.link,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ title: "Book Explorer" }} />
            <Stack.Screen
              name="scan"
              options={{ title: "Scan Barcode", presentation: "modal", headerRight: () => <HeaderActions /> }}
            />
            <Stack.Screen name="book/[isbn]" options={{ title: "Book", headerRight: () => <HeaderActions /> }} />
            <Stack.Screen name="author/[id]" options={{ title: "Author", headerRight: () => <HeaderActions /> }} />
            <Stack.Screen
              name="subject/[slug]"
              options={{ title: "Subject", headerRight: () => <HeaderActions /> }}
            />
            <Stack.Screen name="work/[id]" options={{ title: "Work", headerRight: () => <HeaderActions /> }} />
            <Stack.Screen
              name="graph/[type]/[id]"
              options={{ title: "Explore Graph", headerRight: () => <HeaderActions /> }}
            />
            <Stack.Screen name="saved" options={{ title: "My Library", headerRight: () => <NewSearchButton /> }} />
          </Stack>
        </View>
        <Footer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, alignItems: "center" },
  content: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
  stackArea: { flex: 1 },
});
