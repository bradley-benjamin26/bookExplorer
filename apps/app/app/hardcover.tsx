import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { ApiError, disconnectHardcover, fetchHardcoverAccount } from "../src/api/client";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { confirmDestructive } from "../src/confirm";
import { connectHardcover } from "../src/hardcoverConnect";
import { clearSession, getSessionToken } from "../src/hardcoverSession";
import { useThemedStyles, type Theme } from "../src/theme";

const UNAVAILABLE = "Hardcover sign-in isn't available on this server.";
const status = (e: unknown) => (e instanceof ApiError ? e.status : 0);

export default function HardcoverAccount() {
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  // Signed out is decided locally; the server is only asked to confirm a token we hold.
  const [hasToken, setHasToken] = useState(() => getSessionToken() !== null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const account = useQuery({ queryKey: ["hardcover", "account"], queryFn: fetchHardcoverAccount, enabled: hasToken, retry: false });

  const signedOut = !hasToken || status(account.error) === 401;
  const isUnavailable = unavailable || (hasToken && status(account.error) === 503);

  const connect = async () => {
    setError("");
    try {
      if ((await connectHardcover()) === "connected") {
        setHasToken(true);
        await queryClient.invalidateQueries({ queryKey: ["hardcover"] });
      }
    } catch (err) {
      if (status(err) === 503) setUnavailable(true);
      else setError((err as Error).message);
    }
  };

  const disconnect = async () => {
    if (!(await confirmDestructive("Disconnect Hardcover?", "ShelfThread will stop using your Hardcover account.", "Disconnect"))) return;
    await disconnectHardcover().catch(() => {}); // best effort: the local session goes either way
    await clearSession();
    setHasToken(false);
    await queryClient.invalidateQueries({ queryKey: ["hardcover"] });
  };

  let body;
  if (isUnavailable) body = <Text style={styles.helpText}>{UNAVAILABLE}</Text>;
  else if (signedOut)
    body = (
      <>
        <Text style={styles.helpText}>Use your own Hardcover account for ratings and reviews, sync lists, and see your reading progress.</Text>
        <Button variant="primary" onPress={connect}>Connect Hardcover</Button>
      </>
    );
  else if (account.data)
    body = (
      <>
        <Text style={styles.connected}>Connected as @{account.data.username}</Text>
        <Button variant="pill" onPress={disconnect} style={styles.disconnect}>Disconnect</Button>
        {/* Task 10: import section goes here. */}
      </>
    );
  else if (account.error) body = <Text style={styles.errorText}>{account.error.message}</Text>;
  else body = <Text style={styles.helpText}>Loading…</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {body}
      {error ? <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text> : null}
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    helpText: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.inkFaint, lineHeight: 22, marginBottom: spacing.md },
    connected: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    disconnect: { alignSelf: "flex-start" },
    errorText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.sm },
  });
}
