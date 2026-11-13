import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, disconnectHardcover, fetchHardcoverAccount, fetchHardcoverLists } from "../src/api/client";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { confirmDestructive } from "../src/confirm";
import { importList } from "../src/hardcoverLists";
import { prefetchMissingSaved } from "../src/useSavedPrefetch";
import { routes } from "../src/navigation";
import { getLists } from "../src/storage/savedLists";
import { connectHardcover } from "../src/hardcoverConnect";
import { clearSession, getSessionToken } from "../src/hardcoverSession";
import { useThemedStyles, type Theme } from "../src/theme";

const UNAVAILABLE = "Hardcover sign-in isn't available on this server.";
const status = (e: unknown) => (e instanceof ApiError ? e.status : 0);

/** The account controls, shared by this page and the Accounts popup; `onNavigate` closes the popup before an import opens a list. */
export function HardcoverAccountPanel({ onNavigate }: { onNavigate?: () => void }) {
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  // Signed out is decided locally; the server is only asked to confirm a token we hold.
  const [hasToken, setHasToken] = useState(() => getSessionToken() !== null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const account = useQuery({ queryKey: ["hardcover", "account"], queryFn: fetchHardcoverAccount, enabled: hasToken, retry: false });

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // State lags a render, so a fast second tap would pass a `busy` check; the ref flips synchronously.
  const busyRef = useRef(false);
  const remote = useQuery({ queryKey: ["hardcover", "lists"], queryFn: fetchHardcoverLists, enabled: hasToken && !!account.data, retry: false });
  const local = useQuery({ queryKey: ["hardcover", "linked"], queryFn: () => getLists(), enabled: hasToken && !!account.data });
  const linkedTo = (id: number) => local.data?.find((l) => l.hardcoverListId === id);

  const doImport = async (id: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { list, skipped: s } = await importList(id);
      void prefetchMissingSaved(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["hardcover"] });
      onNavigate?.();
      router.push({ pathname: "/lists/[id]", params: { id: list.id, ...(s.length ? { skipped: JSON.stringify(s) } : {}) } });
    } catch (err) {
      setError((err as Error).message);
    }
    busyRef.current = false;
    setBusy(false);
  };

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
    await clearSession(); // also drops cached Hardcover data, via _layout's onSessionCleared
    setHasToken(false);
  };

  let body;
  if (isUnavailable) body = <Text style={styles.helpText}>{UNAVAILABLE}</Text>;
  else if (signedOut)
    body = (
      <>
        <Text style={styles.helpText}>Use your own Hardcover account for ratings, sync lists, and see your reading progress.</Text>
        <Button variant="primary" onPress={connect}>Connect Hardcover</Button>
      </>
    );
  else if (account.data)
    body = (
      <>
        <Text style={styles.connected}>Connected as @{account.data.username}</Text>
        <Button variant="pill" onPress={disconnect} style={styles.disconnect}>Disconnect</Button>
        <Text style={styles.heading} accessibilityRole="header">Import a list from Hardcover</Text>
        {remote.error ? <Text style={styles.errorText}>{remote.error.message}</Text> : null}
        {remote.data?.map((l) => {
          const mine = linkedTo(l.id);
          return (
            <View key={l.id} style={styles.row}>
              <Text style={styles.rowText}>{l.name} · {l.booksCount} books</Text>
              {mine ? (
                <Button variant="pill" onPress={() => { onNavigate?.(); router.push(routes.list(mine.id)); }}>Imported</Button>
              ) : (
                <Button variant="pill" disabled={busy} onPress={() => doImport(l.id)}>Import</Button>
              )}
            </View>
          );
        })}
      </>
    );
  else if (account.error) body = <Text style={styles.errorText}>{account.error.message}</Text>;
  else body = <Text style={styles.helpText}>Loading…</Text>;

  return (
    <>
      {body}
      {error ? <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text> : null}
    </>
  );
}

export default function HardcoverAccount() {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <HardcoverAccountPanel />
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
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
    rowText: { flex: 1, fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    disconnect: { alignSelf: "flex-start" },
    errorText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.sm },
  });
}
