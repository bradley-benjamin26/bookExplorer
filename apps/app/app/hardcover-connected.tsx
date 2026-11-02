import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Button } from "../src/components/Button";
import { redeemOnce } from "../src/hardcoverConnect";
import { routes } from "../src/navigation";
import { useThemedStyles, type Theme } from "../src/theme";

/** Where the browser lands after Hardcover consent (web, or a native deep link). */
export default function HardcoverConnected() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { handoff, error: errorParam } = useLocalSearchParams<{ handoff?: string; error?: string }>();
  const [error, setError] = useState(errorParam ? "Hardcover wasn't connected." : "");

  useEffect(() => {
    if (!handoff) return;
    // redeemOnce skips a code already redeemed (the native flow redeems it too), so this only navigates then.
    redeemOnce(handoff)
      .then(() => queryClient.invalidateQueries({ queryKey: ["hardcover"] }))
      .then(() => router.replace(routes.hardcover()), (err: Error) => setError(err.message));
  }, [handoff, queryClient, router]);

  if (!error && handoff) return <Text style={styles.text}>Connecting…</Text>;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.text}>{error || "Hardcover wasn't connected."}</Text>
      <Button variant="pill" onPress={() => router.replace(routes.hardcover())}>Back to My Hardcover account</Button>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
    text: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, margin: spacing.lg, marginBottom: spacing.md },
  });
}
