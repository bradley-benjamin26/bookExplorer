import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerTitleStyle: { fontWeight: "600" } }}>
        <Stack.Screen name="index" options={{ title: "Book Explorer" }} />
        <Stack.Screen name="scan" options={{ title: "Scan Barcode", presentation: "modal" }} />
        <Stack.Screen name="book/[isbn]" options={{ title: "Book" }} />
        <Stack.Screen name="author/[id]" options={{ title: "Author" }} />
        <Stack.Screen name="subject/[slug]" options={{ title: "Subject" }} />
        <Stack.Screen name="work/[id]" options={{ title: "Book" }} />
      </Stack>
    </QueryClientProvider>
  );
}
